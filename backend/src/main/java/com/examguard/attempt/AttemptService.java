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
import java.util.Objects;

@Service
public class AttemptService {

    private final AttemptRepository attemptRepository;
    private final QuestionRepository questionRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final AccessService accessService;
    private final JoinService joinService;

    public AttemptService(
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository,
            AnswerRevisionRepository revisionRepository,
            AccessService accessService,
            JoinService joinService) {
        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
        this.revisionRepository = revisionRepository;
        this.accessService = accessService;
        this.joinService = joinService;
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
                joinService.examForAttempt(attempt.getExam()),
                joinService.latestAnswers(attempt));
    }

    @Transactional
    public SaveAnswerResponse saveAnswer(Authentication auth, Long attemptId, Long questionId,
                                         SaveAnswerRequest request) {
        Attempt attempt = accessService.requireAttemptOwner(auth, attemptId);
        requireInProgress(attempt);
        Question question = questionRepository.findByIdAndExamId(questionId, attempt.getExam().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));

        AnswerRevision latest = revisionRepository
                .findFirstByAttemptIdAndQuestionIdOrderByRevisionNoDesc(attemptId, questionId)
                .orElse(null);

        if (latest != null && request.clientSeq() < latest.getClientSeq()) {
            return response(latest, request.text());
        }
        if (latest != null && Objects.equals(
                TextNormalizer.normalize(latest.getText()), TextNormalizer.normalize(request.text()))) {
            return response(latest, request.text());
        }

        AnswerRevision revision = new AnswerRevision();
        revision.setAttempt(attempt);
        revision.setQuestion(question);
        revision.setRevisionNo(latest == null ? 1 : latest.getRevisionNo() + 1);
        revision.setText(TextNormalizer.normalize(request.text()));
        revision.setClientSeq(request.clientSeq());
        revision.setSavedAt(Instant.now());
        revisionRepository.save(revision);

        attempt.setLastSeenAt(revision.getSavedAt());
        attemptRepository.save(attempt);
        return response(revision, request.text());
    }

    @Transactional
    public SubmitResponse submit(Authentication auth, Long attemptId, SubmitRequest request) {
        Attempt attempt = accessService.requireAttemptOwner(auth, attemptId);
        if (attempt.getStatus() == AttemptStatus.SUBMITTED) {
            return new SubmitResponse(attempt.getId(), attempt.getStatus().name(),
                    attempt.getSubmittedAt(), attempt.isLateSubmission());
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        boolean late = isLate(attempt, now);
        attempt.setStatus(AttemptStatus.SUBMITTED);
        attempt.setSubmittedAt(now);
        attempt.setLastSeenAt(now);
        attempt.setLateSubmission(late);
        attemptRepository.save(attempt);
        return new SubmitResponse(attempt.getId(), attempt.getStatus().name(), now, late);
    }

    private boolean isLate(Attempt attempt, Instant now) {
        Instant deadline = attempt.getStartedAt()
                .plus(attempt.getExam().getDurationMinutes(), ChronoUnit.MINUTES);
        return now.isAfter(deadline);
    }

    private void requireInProgress(Attempt attempt) {
        if (attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Attempt is no longer accepting answers");
        }
    }

    private SaveAnswerResponse response(AnswerRevision revision, String submittedText) {
        return new SaveAnswerResponse(
                revision.getQuestion().getId(),
                revision.getRevisionNo(),
                revision.getSavedAt(),
                TextNormalizer.wordCount(submittedText));
    }
}
