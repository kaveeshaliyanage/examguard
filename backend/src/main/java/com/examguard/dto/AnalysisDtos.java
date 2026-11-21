package com.examguard.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Payloads exchanged with the Python analysis service.
 *
 * Isolation is structural: {@link PairAnalysisRequest} has no activity fields and
 * {@link IncidentAnalysisRequest} contains only one candidate's answers.
 */
public final class AnalysisDtos {

    private AnalysisDtos() {
    }

    public record QuestionPayload(Long id, String prompt) {
    }

    public record RevisionPayload(Integer revisionNo, String text, Instant savedAt) {
    }

    public record AnswerPayload(Long questionId, String text, List<RevisionPayload> revisions) {
    }

    public record PairCandidatePayload(String candidateCode, Long attemptId, List<AnswerPayload> answers) {
    }

    public record PairConfig(
            int minAnswerChars,
            double similarityThreshold,
            int rareDfMax,
            int timingWindowSeconds,
            int maxFindings) {
    }

    public record PairAnalysisRequest(
            Long examId,
            String modelVersion,
            List<QuestionPayload> questions,
            List<PairCandidatePayload> candidates,
            PairConfig config) {
    }

    public record EventPayload(
            String eventType,
            String domain,
            Instant occurredAt,
            Instant receivedAt,
            Integer tabId) {
    }

    public record IncidentCandidatePayload(
            String candidateCode,
            Long attemptId,
            List<AnswerPayload> answers,
            List<EventPayload> events,
            Instant monitoringStart,
            Instant monitoringEnd,
            Integer examDurationMinutes,
            boolean extensionConnected) {
    }

    public record RulePayload(String category, String domainPattern, String note) {
    }

    public record IncidentConfig(
            int timingWindowSeconds,
            double minCoveragePercent,
            int maxFindings) {
    }

    public record IncidentAnalysisRequest(
            Long examId,
            String modelVersion,
            List<IncidentCandidatePayload> candidates,
            List<RulePayload> rules,
            IncidentConfig config) {
    }

    public record AuthorshipRevisionPayload(Integer revisionNo, String text, Instant savedAt) {
    }

    public record AuthorshipAnswerPayload(Long questionId, String text, List<AuthorshipRevisionPayload> revisions) {
    }

    public record AuthorshipCandidatePayload(String candidateCode, Long attemptId, List<AuthorshipAnswerPayload> answers) {
    }

    public record AuthorshipConfig(int minAnswerChars, int maxFindings) {
    }

    public record AuthorshipRequest(
            Long examId,
            String modelVersion,
            List<AuthorshipCandidatePayload> candidates,
            AuthorshipConfig config) {
    }

    public record AuthorshipFindingResult(
            String candidateCode,
            Long questionId,
            double priorityScore,
            String priorityBand,
            double probability,
            String summary,
            Map<String, Object> features,
            List<EvidenceResult> evidence) {
    }

    public record AuthorshipResponse(
            String modelVersion,
            List<AuthorshipFindingResult> findings,
            Map<String, Object> stats) {
    }

    public record EvidenceResult(
            String source,
            double weight,
            Long questionId,
            String detail,
            Map<String, Object> metadata) {
    }

    public record FindingResult(
            String type,
            String candidateA,
            String candidateB,
            Long questionId,
            double priorityScore,
            String priorityBand,
            String summary,
            boolean coverageWarning,
            List<EvidenceResult> evidence) {
    }

    public record AnalysisResponse(
            String modelVersion,
            List<FindingResult> findings,
            Map<String, Object> stats) {
    }
}
