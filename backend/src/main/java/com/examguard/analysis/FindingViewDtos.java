package com.examguard.analysis;

import com.examguard.domain.AnalysisStatus;
import com.examguard.domain.DecisionOutcome;
import com.examguard.domain.EvidenceSource;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.FindingType;
import com.examguard.domain.PriorityBand;
import com.examguard.dto.CommonDtos.ExamQuestionView;
import com.examguard.dto.CommonDtos.ExamRef;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class FindingViewDtos {

    private FindingViewDtos() {
    }

    public record AnalysisRunView(
            Long id,
            AnalysisStatus status,
            String modelVersion,
            String inputHash,
            String error,
            long findingsCreated,
            Instant startedAt,
            Instant finishedAt) {
    }

    public record FindingSummary(
            Long id,
            FindingType type,
            double priorityScore,
            PriorityBand priorityBand,
            FindingStatus status,
            String candidateA,
            String candidateB,
            String summary,
            boolean coverageWarning,
            long evidenceCount,
            Instant createdAt) {
    }

    public record EvidenceView(
            Long id,
            EvidenceSource source,
            double weight,
            Long questionId,
            String detail,
            Map<String, Object> metadata,
            Instant createdAt) {
    }

    public record DecisionView(
            Long id,
            String reviewerName,
            DecisionOutcome outcome,
            String rationale,
            Instant createdAt) {
    }

    public record RevisionView(Integer revisionNo, String text, Instant savedAt) {
    }

    public record PairAnswer(Long questionId, String text, List<RevisionView> revisions) {
    }

    public record PairCandidate(String candidateCode, List<PairAnswer> answers) {
    }

    public record PairContext(List<ExamQuestionView> questions, List<PairCandidate> candidates) {
    }

    public record ObservedEvent(
            String eventType,
            String domain,
            Instant occurredAt,
            String classification,
            String rulePattern) {
    }

    public record IncidentContext(
            String candidateCode,
            Instant monitoringStart,
            Instant monitoringEnd,
            double coveragePercent,
            boolean coverageWarning,
            List<ObservedEvent> events) {
    }

    public record FindingDetail(
            Long id,
            FindingType type,
            double priorityScore,
            PriorityBand priorityBand,
            FindingStatus status,
            String candidateA,
            String candidateB,
            String summary,
            boolean coverageWarning,
            Instant createdAt,
            ExamRef exam,
            List<EvidenceView> evidence,
            List<DecisionView> decisions,
            PairContext pairContext,
            IncidentContext incidentContext) {
    }
}
