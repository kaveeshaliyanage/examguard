package com.examguard.grading;

import com.examguard.domain.QuestionType;
import com.examguard.judge.CodeRunnerDtos.CodeGradeDetail;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class GradingDtos {

    private GradingDtos() {
    }

    public record GradingRow(
            Long attemptId,
            String candidateCode,
            Long questionId,
            String prompt,
            QuestionType type,
            BigDecimal points,
            String text,
            List<String> selectedOptions,
            Integer revisionNo,
            Instant savedAt,
            JsonNode answerKey,
            String explanation,
            BigDecimal awardedPoints,
            String comment,
            CodeGradeDetail detail) {
    }

    public record GradeRequest(
            @NotNull @DecimalMin("0.00") BigDecimal awardedPoints,
            @Size(max = 4000) String comment) {
    }

    public record GradeResponse(
            Long questionId,
            BigDecimal awardedPoints,
            BigDecimal maxPoints,
            Instant gradedAt) {
    }

    public record ReleaseResponse(int releasedAttempts) {
    }
}
