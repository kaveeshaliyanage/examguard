package com.examguard.dto;

import com.examguard.domain.Role;

import java.time.Instant;

/**
 * Views shared by more than one feature. Feature-specific request/response shapes live with the
 * feature that owns them.
 */
public final class CommonDtos {

    private CommonDtos() {
    }

    public record UserView(Long id, String email, String displayName, Role role) {
    }

    public record ExamRef(Long id, String code, String title) {
    }

    public record ExamQuestionView(Long id, Integer orderIndex, String prompt, Integer maxWords) {
    }

    public record HealthView(String status, String database, String analysis) {
    }

    public record ErrorView(Instant timestamp, int status, String error, String message, String path) {
    }
}
