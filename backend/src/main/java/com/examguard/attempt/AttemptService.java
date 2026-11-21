package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.AttemptState;
import com.examguard.attempt.AttemptDtos.PreflightRequest;
import com.examguard.attempt.AttemptDtos.PreflightResponse;
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
import com.examguard.service.AuditService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
    private final ObjectMapper objectMapper;
    private final AuditService auditService;

    public AttemptService(
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository,
            AnswerRevisionRepository revisionRepository,
            AccessService accessService,
            JoinService joinService,
            AnswerJson answerJson,
            AttemptStateMachine stateMachine,
            GradingService gradingService,
            ObjectMapper objectMapper,
            AuditService auditService) {
        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
        this.revisionRepository = revisionRepository;
        this.accessService = accessService;
        this.joinService = joinService;
        this.answerJson = answerJson;
        this.stateMachine = stateMachine;
        this.gradingService = gradingService;
        this.objectMapper = objectMapper;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public AttemptState state(Authentication auth, Long attemptId) {
        Attempt attempt = accessService.requireAttemptAccess(auth, attemptId);
        return new AttemptState(
                attempt.getId(),
                attempt.getStatus().name(),
                attempt.getStartedAt(),
                attempt.getActiveStartedAt(),
                attempt.getPreflightCompletedAt(),
                attempt.getExam().isRequiresPreflight(),
                attempt.isAutoSubmitted(),
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
    public PreflightResponse completePreflight(Authentication auth, Long attemptId, PreflightRequest request) {
        Attempt attempt = accessService.requireAttemptOwner(auth, attemptId);
        stateMachine.requireInProgress(attempt);
        if (attempt.getPreflightCompletedAt() != null) {
            return new PreflightResponse(attempt.getPreflightCompletedAt(), attempt.getActiveStartedAt(),
                    AttemptClock.deadline(attempt), attempt.getExam().getDurationMinutes(), Instant.now());
        }
        if (!request.fullscreen() || !request.connectionOk() || !request.deviceOk()
                || !request.micOk() || !request.noiseOk() || !request.cameraOk()
                || !request.faceDetected() || !request.gazeOnScreen()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Every pre-exam check must pass before the exam can start");
        }
        String photo = request.photoDataUrl().trim();
        if (!photo.startsWith("data:image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The profile photo is not a data URL");
        }

        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        attempt.setPreflightCompletedAt(now);
        attempt.setActiveStartedAt(now);
        // The clock and coverage both start here, not at page join time.
        attempt.setStartedAt(now);
        attempt.setLastSeenAt(now);
        attempt.setProfilePhoto(photo);
        attempt.setPhotoTakenAt(now);
        attempt.setPreflightJson(preflightJson(request));
        attemptRepository.save(attempt);

        auditService.record(attempt.getStudentUser(), attempt.getExam().getId(), "PREFLIGHT_COMPLETED",
                "ATTEMPT", attempt.getId(), Map.of(
                        "fullscreen", true, "connectionOk", true, "deviceOk", true,
                        "micOk", true, "noiseOk", true, "cameraOk", true,
                        "faceDetected", true, "gazeOnScreen", true));
        return new PreflightResponse(now, now, AttemptClock.deadline(attempt),
                attempt.getExam().getDurationMinutes(), Instant.now());
    }

    @Transactional
    public SaveAnswerResponse saveAnswer(Authentication auth, Long attemptId, Long questionId,
                                         SaveAnswerRequest request) {
        Attempt attempt = accessService.requireAttemptOwner(auth, attemptId);
        stateMachine.requireInProgress(attempt);
        requirePreflight(attempt);
        if (AttemptClock.isPastDeadline(attempt, Instant.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Time is up. Answers saved before the deadline are kept; submit to finish.");
        }
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
        requirePreflight(attempt);
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
        return AttemptClock.isPastDeadline(attempt, now);
    }

    private void requirePreflight(Attempt attempt) {
        if (attempt.getExam().isRequiresPreflight() && attempt.getPreflightCompletedAt() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Complete the pre-exam checks before answering or submitting");
        }
    }

    private String preflightJson(PreflightRequest request) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("fullscreen", request.fullscreen());
        detail.put("connectionOk", request.connectionOk());
        detail.put("deviceOk", request.deviceOk());
        detail.put("micOk", request.micOk());
        detail.put("noiseOk", request.noiseOk());
        detail.put("cameraOk", request.cameraOk());
        detail.put("faceDetected", request.faceDetected());
        detail.put("gazeOnScreen", request.gazeOnScreen());
        if (request.noiseLevel() != null) {
            detail.put("noiseLevel", request.noiseLevel());
        }
        if (request.checks() != null && request.checks().size() <= 20) {
            // Client diagnostics sit alongside the booleans so the staff view can show them
            // as plain rows; an attacker-supplied key never overwrites a server verdict.
            request.checks().forEach((key, value) -> {
                if (key != null && !key.isBlank() && !detail.containsKey(key)) {
                    detail.put(key, value);
                }
            });
        }
        try {
            return objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pre-exam checks are not serialisable");
        }
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
