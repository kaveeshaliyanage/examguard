package com.examguard.attempt;

import com.examguard.domain.EventType;
import com.examguard.domain.IntegritySignal;
import com.examguard.domain.QuestionType;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class AttemptDtos {

    private AttemptDtos() {
    }

    public record JoinRequest(
            @NotBlank String examCode,
            @NotBlank String candidateCode,
            @Size(max = 12) String accessPin,
            String resumeToken) {
    }

    public record AttemptQuestionView(
            Long id,
            Integer orderIndex,
            String prompt,
            QuestionType type,
            BigDecimal points,
            Integer maxWords,
            JsonNode content) {
    }

    public record ExamForAttempt(
            Long id,
            String code,
            String title,
            Integer durationMinutes,
            String instructions,
            Integer maxStrikes,
            List<AttemptQuestionView> questions) {
    }

    public record AnswerView(
            Long questionId,
            String text,
            List<String> selectedOptions,
            Integer revisionNo,
            Instant savedAt) {
    }

    public record JoinResponse(
            Long attemptId,
            String sessionToken,
            String collectorToken,
            String status,
            Instant startedAt,
            Instant activeStartedAt,
            Instant preflightCompletedAt,
            boolean requiresPreflight,
            boolean autoSubmitted,
            Instant submittedAt,
            Instant serverNow,
            boolean extensionConnected,
            ExamForAttempt exam,
            List<AnswerView> answers) {
    }

    public record AttemptState(
            Long attemptId,
            String status,
            Instant startedAt,
            Instant activeStartedAt,
            Instant preflightCompletedAt,
            boolean requiresPreflight,
            boolean autoSubmitted,
            Instant submittedAt,
            Instant lastSeenAt,
            Instant serverNow,
            boolean extensionConnected,
            int strikeCount,
            int maxStrikes,
            Instant terminatedAt,
            String terminationReason,
            ExamForAttempt exam,
            List<AnswerView> answers) {
    }

    public record PreflightRequest(
            boolean fullscreen,
            boolean connectionOk,
            boolean deviceOk,
            boolean micOk,
            boolean noiseOk,
            boolean cameraOk,
            boolean faceDetected,
            boolean gazeOnScreen,
            @Size(max = 200) String noiseLevel,
            @NotBlank @Size(max = 500_000) String photoDataUrl,
            Map<String, Object> checks) {
    }

    public record PreflightResponse(
            Instant completedAt,
            Instant activeStartedAt,
            Instant deadlineAt,
            int durationMinutes,
            Instant serverNow) {
    }

    public record AttemptPreflightView(
            Instant completedAt,
            Instant photoTakenAt,
            String photoDataUrl,
            Map<String, Object> checks) {
    }

    public record SaveAnswerRequest(
            @Size(max = 20000) String text,
            @Size(max = 10) List<String> selectedOptions,
            @NotNull Long clientSeq) {
    }

    public record SaveAnswerResponse(Long questionId, Integer revisionNo, Instant savedAt, Integer wordCount) {
    }

    public record SubmitRequest(Boolean late) {
    }

    public record SubmitResponse(Long attemptId, String status, Instant submittedAt, boolean late) {
    }

    public record IntegritySignalRequest(
            @NotBlank @Size(max = 100) String episodeKey,
            @NotNull IntegritySignal signal,
            @NotNull Instant occurredAt,
            Long clientSeq,
            Map<String, Object> metadata) {
    }

    public record IntegritySignalResponse(
            int strikeCount,
            int maxStrikes,
            boolean terminated,
            String status) {
    }

    public record EventDto(
            @NotBlank @Size(max = 100) String clientEventId,
            @NotNull EventType eventType,
            @Size(max = 255) String domain,
            @NotNull Instant occurredAt,
            Integer tabId,
            Map<String, Object> metadata) {
    }

    public record EventBatchRequest(@NotEmpty @Size(max = 200) List<@Valid EventDto> events) {
    }

    public record EventBatchResponse(int accepted, int duplicates, int rejected) {
    }

    public record HeartbeatRequest(
            Instant coverageStart,
            Instant lastSeenAt,
            Long eventCount,
            Integer domainsObserved,
            Boolean extensionConnected) {
    }

    public record CoverageView(
            Instant coverageStart,
            Instant lastSeenAt,
            long eventCount,
            long domainsObserved,
            boolean extensionConnected,
            double coveragePercent,
            boolean warning) {
    }
}
