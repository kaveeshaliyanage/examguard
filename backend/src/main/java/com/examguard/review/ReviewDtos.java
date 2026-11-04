package com.examguard.review;

import com.examguard.domain.DecisionOutcome;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class ReviewDtos {

    private ReviewDtos() {
    }

    public record DecisionRequest(
            @NotNull DecisionOutcome outcome,
            @NotBlank @Size(min = 10, max = 4000) String rationale) {
    }

    public record AuditView(
            Long id,
            String actor,
            String action,
            String entityType,
            Long entityId,
            String detail,
            Instant createdAt) {
    }
}
