package com.examguard.dashboard;

import com.examguard.domain.AnalysisStatus;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.FindingType;
import com.examguard.domain.PriorityBand;
import com.examguard.student.StudentDtos.StudentAttemptSummary;
import com.examguard.student.StudentDtos.StudentProfile;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class DashboardDtos {

    private DashboardDtos() {
    }

    public record StudentStats(
            long totalAttempts,
            long submitted,
            long terminated,
            long released,
            BigDecimal averagePercentage,
            int strikesThisTerm) {
    }

    public record StudentDashboard(
            StudentProfile profile,
            StudentStats stats,
            List<UpcomingExam> upcoming,
            List<StudentAttemptSummary> attempts) {
    }

    public record UpcomingExam(
            Long examId,
            String code,
            String title,
            Instant opensAt,
            Instant closesAt,
            boolean openNow) {
    }

    public record ExamHealth(
            Long examId,
            String code,
            String title,
            ExamStatus status,
            long attempts,
            long submitted,
            long ungraded,
            long openFindings,
            long flaggedCandidates,
            long awaitingRelease,
            Instant lastAnalysisAt) {
    }

    public record UngradedAttempt(
            Long attemptId,
            Long examId,
            String examTitle,
            String candidateCode,
            AttemptStatus status,
            long pendingQuestions) {
    }

    public record FlaggedCandidate(
            Long findingId,
            Long examId,
            String examTitle,
            String candidateCode,
            double priorityScore,
            PriorityBand band,
            FindingType type) {
    }

    public record ScoreBucket(String label, long count) {
    }

    public record FocusLossPoint(String date, long focusLossSignals) {
    }

    public record BandCount(PriorityBand band, long count) {
    }

    public record FunnelStage(String stage, long count) {
    }

    public record LecturerDashboard(
            List<ExamHealth> exams,
            List<UngradedAttempt> ungradedQueue,
            List<FlaggedCandidate> flagged,
            List<ScoreBucket> distribution,
            List<FocusLossPoint> integrityTrend,
            List<BandCount> bandMix,
            List<FunnelStage> funnel,
            long ungradedTotal,
            long flaggedTotal,
            long awaitingRelease) {
    }

    public record AdminCounts(
            long users,
            long students,
            long lecturers,
            long admins,
            long exams,
            long attempts,
            long findings) {
    }

    public record RunRow(
            Long id,
            Long examId,
            String examTitle,
            AnalysisStatus status,
            String modelVersion,
            Instant startedAt,
            Instant finishedAt) {
    }

    public record AuditRow(
            Long id,
            String action,
            String entityType,
            Long entityId,
            Long examId,
            String actor,
            Instant createdAt) {
    }

    public record AdminDashboard(
            AdminCounts counts,
            boolean aiHealthy,
            List<RunRow> recentRuns,
            List<AuditRow> recentAudit) {
    }
}
