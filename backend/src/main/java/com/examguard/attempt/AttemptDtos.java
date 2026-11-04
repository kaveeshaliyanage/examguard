package com.examguard.attempt;

import com.examguard.domain.EventType;
import com.examguard.dto.CommonDtos.ExamQuestionView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class AttemptDtos {

    private AttemptDtos() {
    }

    public record JoinRequest(
            @NotBlank String examCode,
            @NotBlank String candidateCode) {
    }

    public record ExamForAttempt(
            Long id,
            String code,
            String title,
            Integer durationMinutes,
            List<ExamQuestionView> questions) {
    }

    public record AnswerView(Long questionId, String text, Integer revisionNo, Instant savedAt) {
    }

    public record JoinResponse(
            Long attemptId,
            String sessionToken,
            String collectorToken,
            String status,
            Instant startedAt,
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
            Instant submittedAt,
            Instant lastSeenAt,
            Instant serverNow,
            boolean extensionConnected,
            ExamForAttempt exam,
            List<AnswerView> answers) {
    }

    public record SaveAnswerRequest(
            @NotNull @Size(max = 20000) String text,
            @NotNull Long clientSeq) {
    }

    public record SaveAnswerResponse(Long questionId, Integer revisionNo, Instant savedAt, Integer wordCount) {
    }

    public record SubmitRequest(Boolean late) {
    }

    public record SubmitResponse(Long attemptId, String status, Instant submittedAt, boolean late) {
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
