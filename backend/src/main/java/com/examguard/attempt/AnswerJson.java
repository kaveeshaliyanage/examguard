package com.examguard.attempt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
public class AnswerJson {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    public AnswerJson(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String write(List<String> selectedOptions) {
        try {
            return objectMapper.writeValueAsString(selectedOptions == null ? List.of() : selectedOptions);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected options are not serialisable");
        }
    }

    public List<String> read(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            List<String> values = objectMapper.readValue(raw, STRING_LIST);
            return values == null ? List.of() : values.stream().filter(value -> value != null).toList();
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }

    public Set<String> asSet(String raw) {
        return new LinkedHashSet<>(read(raw));
    }
}
