package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.AttemptState;
import com.examguard.attempt.AttemptDtos.SaveAnswerRequest;
import com.examguard.attempt.AttemptDtos.SaveAnswerResponse;
import com.examguard.attempt.AttemptDtos.SubmitRequest;
import com.examguard.attempt.AttemptDtos.SubmitResponse;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.grading.GradingService;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.service.AccessService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@Service
public class AttemptService {

    private final AttemptRepository attemptRepository;
    private final QuestionRepository questionRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final AccessService accessService;
    private final JoinService joinService;
    private final AnswerJson answerJson;
    private final AttemptStateMachine stateMachine;
    private final GradingService gradingService;

    public AttemptService(
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository,
            AnswerRevisionRepository revisionRepository,
            AccessService accessService,
            JoinService joinService,
            AnswerJson answerJson,
            AttemptStateMachine stateMachine,
            GradingService gradingService) {
        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
        this.revisionRepository = revisionRepository;
        this.accessService = accessService;
        this.joinService = joinService;
        this.answerJson = answerJson;
        this.stateMachine = stateMachine;
        this.gradingService = gradingService;
    }

    @Transactional(readOnly = true)
    public AttemptState state(Authentication auth, Long attemptId) {
        Attempt attempt = accessService.requireAttemptAccess(auth, attemptId);
        return new AttemptState(
                attempt.getId(),
                attempt.getStatus().name(),
                attempt.getStartedAt(),
                attempt.getSubmittedAt(),
                attempt.getLastSeenAt(),
                Instant.now(),
                attempt.isExtensionConnected(),
                attempt.getStrikeCount() == null ? 0 : attempt.getStrikeCount(),
                attempt.getMaxStrikes(),
                attempt.getTerminatedAt(),
                attempt.getTerminationReason(),
                joinService.examForAttempt(attempt.getExam()),
                joinService.latestAnswers(attempt));
    }

    @Transactional
    public SaveAnswerResponse saveAnswer(Authentication auth, Long attemptId, Long questionId,
                                         SaveAnswerRequest request) {
        Attempt attempt = accessService.requireAttemptOwner(auth, attemptId);
        stateMachine.requireInProgress(attempt);
        Question question = questionRepository.findByIdAndExamId(questionId, attempt.getExam().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));

        String text = normalizeAnswer(question, request.text());
        List<String> selectedOptions = normalizeOptions(request.selectedOptions());
        String selectedJson = answerJson.write(selectedOptions);

        AnswerRevision latest = revisionRepository
                .findFirstByAttemptIdAndQuestionIdOrderByRevisionNoDesc(attemptId, questionId)
                .orElse(null);

        if (latest != null && request.clientSeq() < latest.getClientSeq()) {
            return response(latest, text);
        }
        if (latest != null && isUnchanged(latest, text, selectedOptions)) {
            return response(latest, text);
        }

        AnswerRevision revision = new AnswerRevision();
        revision.setAttempt(attempt);
        revision.setQuestion(question);
        revision.setRevisionNo(latest == null ? 1 : latest.getRevisionNo() + 1);
        revision.setText(text);
        revision.setSelectedOptions(selectedJson);
        revision.setClientSeq(request.clientSeq());
        revision.setSavedAt(Instant.now());
        revisionRepository.save(revision);

        // Column-scoped update: saving the whole entity would write back a strike count read
        // before a concurrent integrity signal committed.
        attemptRepository.touchLastSeen(attempt.getId(), revision.getSavedAt());
        return response(revision, text);
    }

    @Transactional
    public SubmitResponse submit(Authentication auth, Long attemptId, SubmitRequest request) {
        Attempt attempt = accessService.requireAttemptOwner(auth, attemptId);
        if (attempt.getStatus() == AttemptStatus.SUBMITTED) {
            return new SubmitResponse(attempt.getId(), attempt.getStatus().name(),
                    attempt.getSubmittedAt(), attempt.isLateSubmission());
        }
        stateMachine.transition(attempt, AttemptStatus.SUBMITTED);
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        boolean late = isLate(attempt, now);
        attempt.setSubmittedAt(now);
        attempt.setLastSeenAt(now);
        attempt.setLateSubmission(late);
        attemptRepository.save(attempt);

        gradingService.autoGrade(attempt);
        return new SubmitResponse(attempt.getId(), attempt.getStatus().name(), now, late);
    }

    private boolean isUnchanged(AnswerRevision latest, String text, List<String> selectedOptions) {
        boolean sameText = Objects.equals(
                normalizeAnswer(latest.getQuestion(), latest.getText()), text);
        boolean sameOptions = answerJson.asSet(latest.getSelectedOptions())
                .equals(new LinkedHashSet<>(selectedOptions));
        return sameText && sameOptions;
    }

    /**
     * Prose is whitespace-collapsed, but code keeps its layout: indentation and line breaks are
     * part of the answer and must reach the judge byte for byte.
     */
    private static String normalizeAnswer(Question question, String text) {
        if (question.getType() == QuestionType.CODE) {
            return text == null ? "" : text.replace("\r\n", "\n").replace('\r', '\n');
        }
        return TextNormalizer.normalize(text);
    }

    private List<String> normalizeOptions(List<String> selectedOptions) {
        if (selectedOptions == null) {
            return List.of();
        }
        return selectedOptions.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .distinct()
                .toList();
    }

    private boolean isLate(Attempt attempt, Instant now) {
        Instant deadline = attempt.getStartedAt()
                .plus(attempt.getExam().getDurationMinutes(), ChronoUnit.MINUTES);
        return now.isAfter(deadline);
    }

    private SaveAnswerResponse response(AnswerRevision revision, String submittedText) {
        int words = revision.getQuestion().getType() == QuestionType.CODE
                ? 0
                : TextNormalizer.wordCount(submittedText);
        return new SaveAnswerResponse(
                revision.getQuestion().getId(),
                revision.getRevisionNo(),
                revision.getSavedAt(),
                words);
    }
}
