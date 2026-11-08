package com.examguard.student;

import com.examguard.domain.AttemptStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

public final class StudentDtos {

    private StudentDtos() {
    }

    public record RegisterRequest(
            @Email @NotBlank @Size(max = 255) String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotBlank @Size(max = 255) String displayName) {
    }

    public record LoginRequest(
            @Email @NotBlank @Size(max = 255) String email,
            @NotBlank @Size(max = 100) String password) {
    }

    public record StudentProfile(Long id, String email, String displayName) {
    }

    public record AuthResponse(String token, StudentProfile user) {
    }

    public record StudentAttemptSummary(
            Long attemptId,
            String examCode,
            String examTitle,
            AttemptStatus status,
            Instant startedAt,
            Instant submittedAt,
            BigDecimal scorePoints,
            BigDecimal maxPoints,
            boolean released,
            int strikes) {
    }
}
