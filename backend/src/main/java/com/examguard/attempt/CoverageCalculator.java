package com.examguard.attempt;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Mirrors the coverage formula used by the analysis service so the dashboard and the findings
 * agree. Missing observations are unknown, never clean.
 */
public final class CoverageCalculator {

    public static final double GRACE_SECONDS = 120.0;
    public static final double WARNING_THRESHOLD_PERCENT = 60.0;

    private CoverageCalculator() {
    }

    public record Coverage(double percent, boolean warning, Instant firstEventAt, Instant lastEventAt) {
    }

    public static Coverage compute(Instant monitoringStart, Instant monitoringEnd, List<Instant> eventTimes) {
        if (eventTimes == null || eventTimes.isEmpty() || monitoringStart == null || monitoringEnd == null) {
            return new Coverage(0.0, true, null, null);
        }
        long totalSeconds = Duration.between(monitoringStart, monitoringEnd).getSeconds();
        if (totalSeconds <= 0) {
            return new Coverage(0.0, true, null, null);
        }
        Instant first = eventTimes.stream().min(Instant::compareTo).orElse(null);
        Instant last = eventTimes.stream().max(Instant::compareTo).orElse(null);
        long observedSeconds = Duration.between(first, last).getSeconds() + (long) GRACE_SECONDS;
        double percent = Math.max(0.0, Math.min(100.0, observedSeconds * 100.0 / totalSeconds));
        double rounded = Math.round(percent * 100.0) / 100.0;
        return new Coverage(rounded, rounded < WARNING_THRESHOLD_PERCENT, first, last);
    }
}
