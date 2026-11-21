package com.examguard.attempt;

import com.examguard.domain.Attempt;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** One source of truth for when the exam clock started and when it must stop. */
public final class AttemptClock {

    private AttemptClock() {
    }

    /**
     * The clock starts when the supervised pre-exam window is confirmed. Attempts created before
     * that window existed fall back to their join time, which the V5 migration also backfills.
     */
    public static Instant start(Attempt attempt) {
        return attempt.getActiveStartedAt() != null ? attempt.getActiveStartedAt() : attempt.getStartedAt();
    }

    public static Instant deadline(Attempt attempt) {
        return start(attempt).plus(attempt.getExam().getDurationMinutes(), ChronoUnit.MINUTES);
    }

    public static boolean isPastDeadline(Attempt attempt, Instant now) {
        return now.isAfter(deadline(attempt));
    }
}
