package com.examguard.attempt;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.grading.GradingService;
import com.examguard.judge.CodeJudgeService;
import com.examguard.repo.AttemptRepository;
import com.examguard.service.AuditService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

@Service
public class AttemptExpiryService {

    private static final Logger log = LoggerFactory.getLogger(AttemptExpiryService.class);

    private final AttemptRepository attemptRepository;
    private final GradingService gradingService;
    private final CodeJudgeService codeJudgeService;
    private final AuditService auditService;

    public AttemptExpiryService(AttemptRepository attemptRepository,
                                GradingService gradingService,
                                CodeJudgeService codeJudgeService,
                                AuditService auditService) {
        this.attemptRepository = attemptRepository;
        this.gradingService = gradingService;
        this.codeJudgeService = codeJudgeService;
        this.auditService = auditService;
    }

    /**
     * Stops an attempt exactly at its deadline. Answers saved before the deadline are already in
     * answer_revision; nothing after it is accepted, so unanswered questions stay unanswered.
     * Idempotent, and safe to call from both the scheduler and request paths.
     */
    @Transactional
    public boolean expire(Long attemptId) {
        Attempt attempt = attemptRepository.findByIdForUpdate(attemptId).orElse(null);
        if (attempt == null || attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
            return false;
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        if (attempt.getActiveStartedAt() == null || !AttemptClock.isPastDeadline(attempt, now)) {
            return false;
        }
        attempt.setStatus(AttemptStatus.SUBMITTED);
        // Record the deadline, not the tick time: a scheduler that was asleep (an idle free-tier
        // instance, a restart) must not make the attempt look as if it ran on past its time.
        attempt.setSubmittedAt(AttemptClock.deadline(attempt));
        attempt.setLastSeenAt(now);
        attempt.setAutoSubmitted(true);
        attempt.setLateSubmission(false);
        attemptRepository.save(attempt);

        try {
            gradingService.autoGrade(attempt);
        } catch (RuntimeException ex) {
            log.warn("Auto-grading after expiry failed for attempt {}: {}", attemptId, ex.getMessage());
        }
        auditService.record(attempt.getStudentUser(), attempt.getExam().getId(), "ATTEMPT_AUTO_SUBMITTED",
                "ATTEMPT", attempt.getId(),
                Map.of("deadline", AttemptClock.deadline(attempt).toString(), "reason", "DEADLINE_REACHED"));

        try {
            codeJudgeService.judgeAttempt(attemptId);
        } catch (RuntimeException ex) {
            log.warn("Code judging after expiry failed for attempt {}: {}", attemptId, ex.getMessage());
        }
        log.info("Auto-submitted attempt {} at its deadline", attemptId);
        return true;
    }
}
