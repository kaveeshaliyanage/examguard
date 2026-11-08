package com.examguard.exam;

import com.examguard.domain.AttemptStatus;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.QuestionType;
import com.examguard.domain.ResourceCategory;
import com.examguard.exam.QuestionPayloads.AnswerKey;
import com.examguard.exam.QuestionPayloads.Content;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class ExamDtos {

    private ExamDtos() {
    }

    public record QuestionPayload(
            @NotBlank @Size(max = 4000) String prompt,
            QuestionType type,
            BigDecimal points,
            GradingMode gradingMode,
            @Min(0) @Max(5000) Integer maxWords,
            Content content,
            AnswerKey answerKey,
            @Size(max = 8000) String explanation) {
    }

    public record CreateRule(
            @NotNull ResourceCategory category,
            @NotBlank @Size(max = 255) String domainPattern,
            @Size(max = 2000) String note) {
    }

    public record CreateExamRequest(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 255) String title,
            @Size(max = 4000) String description,
            @NotNull @Min(5) @Max(600) Integer durationMinutes,
            Boolean allowExtension,
            @Min(1) @Max(10) Integer maxStrikes,
            @Size(max = 8000) String instructions,
            Instant opensAt,
            Instant closesAt,
            @NotEmpty @Size(max = 100) List<@Valid QuestionPayload> questions,
            @Size(max = 100) List<@Valid CreateRule> resourceRules) {
    }

    /** Full replacement of the editable settings; the exam code is immutable. */
    public record UpdateExamRequest(
            @NotBlank @Size(max = 255) String title,
            @Size(max = 4000) String description,
            @NotNull @Min(5) @Max(600) Integer durationMinutes,
            Boolean allowExtension,
            @NotNull @Min(1) @Max(10) Integer maxStrikes,
            @Size(max = 8000) String instructions,
            Instant opensAt,
            Instant closesAt,
            @Size(max = 100) List<@Valid CreateRule> resourceRules) {
    }

    public record StaffQuestionView(
            Long id,
            Integer orderIndex,
            String prompt,
            QuestionType type,
            BigDecimal points,
            GradingMode gradingMode,
            Integer maxWords,
            JsonNode content,
            JsonNode answerKey,
            String explanation) {
    }

    public record ReorderRequest(@NotEmpty List<Long> questionIds) {
    }

    public record ExamSummary(
            Long id,
            String code,
            String title,
            ExamStatus status,
            Integer durationMinutes,
            long attemptCount,
            long submittedCount,
            long findingCount,
            long openFindingCount,
            Instant lastAnalysisAt,
            Instant createdAt) {
    }

    public record RuleView(Long id, ResourceCategory category, String domainPattern, String note) {
    }

    public record PermissionView(Long userId, String email, String displayName, PermissionLevel level) {
    }

    public record ExamDetail(
            Long id,
            String code,
            String title,
            String description,
            ExamStatus status,
            Integer durationMinutes,
            boolean allowExtension,
            Integer maxStrikes,
            String instructions,
            Instant opensAt,
            Instant closesAt,
            Instant createdAt,
            long attemptCount,
            long submittedCount,
            long findingCount,
            long openFindingCount,
            Instant lastAnalysisAt,
            long enrollmentCount,
            long releasedCount,
            long awaitingReleaseCount,
            List<StaffQuestionView> questions,
            List<RuleView> resourceRules,
            List<PermissionView> permissions) {
    }

    public record RosterEntryView(Long id, String email, Instant createdAt) {
    }

    public record RosterEntryRequest(@NotBlank @Email @Size(max = 255) String email) {
    }

    public record StatusRequest(@NotNull ExamStatus status) {
    }

    public record PermissionRequest(
            Long userId,
            @Email @Size(max = 255) String email,
            @NotNull PermissionLevel level) {
    }

    public record AttemptSummary(
            Long attemptId,
            String candidateCode,
            AttemptStatus status,
            Instant startedAt,
            Instant submittedAt,
            Instant lastSeenAt,
            long answerCount,
            long eventCount,
            double coveragePercent,
            boolean coverageWarning,
            boolean lateSubmission) {
    }
}
