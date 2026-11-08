package com.examguard.judge;

import com.examguard.judge.CodeRunnerDtos.CodeGradeDetail;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/** Reads the per-test detail stored on a code grade. Unreadable detail is treated as absent. */
@Component
public class CodeGradeDetails {

    private final ObjectMapper objectMapper;

    public CodeGradeDetails(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public CodeGradeDetail parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(raw, CodeGradeDetail.class);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }
}
