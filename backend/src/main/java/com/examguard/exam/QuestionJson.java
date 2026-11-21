package com.examguard.exam;

import com.examguard.domain.Question;
import com.examguard.exam.QuestionPayloads.AnswerKey;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class QuestionJson {

    private final ObjectMapper objectMapper;

    public QuestionJson(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public JsonNode content(Question question) {
        return read(question.getContentJson());
    }

    public JsonNode answerKeyNode(Question question) {
        return read(question.getAnswerKeyJson());
    }

    public AnswerKey answerKey(Question question) {
        String raw = question.getAnswerKeyJson();
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(raw, AnswerKey.class);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Stored answer key for question " + question.getId() + " is not valid JSON");
        }
    }

    public String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Question content is not serialisable");
        }
    }

    private JsonNode read(String raw) {
        if (raw == null || raw.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(raw);
        } catch (JsonProcessingException ex) {
            return objectMapper.createObjectNode();
        }
    }
}
