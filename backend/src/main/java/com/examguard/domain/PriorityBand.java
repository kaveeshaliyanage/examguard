package com.examguard.domain;

public enum PriorityBand {
    LOW, MEDIUM, HIGH, CRITICAL;

    public static PriorityBand fromScore(double score) {
        if (score >= 75.0) return CRITICAL;
        if (score >= 55.0) return HIGH;
        if (score >= 30.0) return MEDIUM;
        return LOW;
    }
}
