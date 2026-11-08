package com.examguard.report;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class ReportDtos {

    private ReportDtos() {
    }

    public record QuestionReport(
            Integer orderIndex,
            String prompt,
            String type,
            BigDecimal points,
            BigDecimal awardedPoints,
            String answerText,
            List<String> selectedOptions,
            List<String> correctKeys,
            String comment,
            String explanation) {
    }

    public record IntegritySignal(String signal, Instant occurredAt) {
    }

    public record IntegrityReport(
            int strikes,
            int maxStrikes,
            Instant terminatedAt,
            List<IntegritySignal> events) {
    }

    public record ReviewSignal(
            String kind,
            String label,
            String band,
            double score,
            String detail) {
    }

    public record AttemptReport(
            Long attemptId,
            String examTitle,
            String examCode,
            String candidateCode,
            String status,
            BigDecimal scorePoints,
            BigDecimal maxPoints,
            boolean released,
            Instant submittedAt,
            List<QuestionReport> questions,
            IntegrityReport integrity,
            List<ReviewSignal> reviewSignals) {
    }

    public record BandBucket(String label, long count, int percent) {
    }

    public record QuestionPerformance(
            Integer orderIndex,
            String prompt,
            String type,
            BigDecimal points,
            BigDecimal averageAwarded,
            long answeredCount) {
    }

    public record ExamIntegrity(int totalFocusLosses, long terminatedAttempts, long attemptsWithStrikes) {
    }

    public record FlaggedCandidate(String candidateCode, String label, String band, double score) {
    }

    public record ExamReport(
            Long examId,
            String examCode,
            String examTitle,
            Integer durationMinutes,
            long questionCount,
            long attempts,
            long submitted,
            long ungraded,
            BigDecimal averageScore,
            BigDecimal maxPoints,
            List<BandBucket> distribution,
            List<QuestionPerformance> perQuestion,
            ExamIntegrity integrity,
            List<FlaggedCandidate> flagged) {
    }

    public record AdminOverview(
            long users,
            long lecturers,
            long students,
            long exams,
            long attempts,
            long findings,
            long openFindings,
            String analysisStatus,
            List<AdminExamRow> recentExams) {
    }

    public record AdminExamRow(
            Long examId,
            String code,
            String title,
            String status,
            long attempts,
            long findings) {
    }
}
