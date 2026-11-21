package com.examguard.attempt;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.repo.AttemptRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Safety net for students who close the tab, lose power or never submit. Runs often enough that
 * the recorded stop time is close to the real deadline; the request path also rejects any save
 * past the deadline, so a late scheduler tick cannot admit extra answers.
 */
@Component
public class AttemptExpiryJob {

    private final AttemptRepository attemptRepository;
    private final AttemptExpiryService expiryService;

    public AttemptExpiryJob(AttemptRepository attemptRepository, AttemptExpiryService expiryService) {
        this.attemptRepository = attemptRepository;
        this.expiryService = expiryService;
    }

    @Scheduled(fixedDelayString = "${app.attempt-expiry.interval-ms:15000}",
            initialDelayString = "${app.attempt-expiry.interval-ms:15000}")
    public void expireDueAttempts() {
        Instant now = Instant.now();
        for (Attempt attempt : attemptRepository.findRunningWithExam(AttemptStatus.IN_PROGRESS)) {
            if (AttemptClock.isPastDeadline(attempt, now)) {
                expiryService.expire(attempt.getId());
            }
        }
    }
}
