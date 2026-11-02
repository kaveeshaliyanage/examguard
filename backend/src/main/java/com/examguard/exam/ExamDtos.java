package com.examguard.exam;

import com.examguard.domain.AttemptStatus;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.ResourceCategory;
import com.examguard.dto.CommonDtos.ExamQuestionView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class ExamDtos {

    private ExamDtos() {
    }

    public record CreateQuestion(
            @NotBlank @Size(max = 4000) String prompt,
            @NotNull @Min(1) @Max(5000) Integer maxWords) {
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
            @NotEmpty @Size(max = 100) List<@Valid CreateQuestion> questions,
            @Size(max = 100) List<@Valid CreateRule> resourceRules) {
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
            Instant createdAt,
            long attemptCount,
            long submittedCount,
            long findingCount,
            long openFindingCount,
            Instant lastAnalysisAt,
            List<ExamQuestionView> questions,
            List<RuleView> resourceRules,
            List<PermissionView> permissions) {
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
