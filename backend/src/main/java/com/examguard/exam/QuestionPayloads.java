package com.examguard.exam;

import java.util.List;

public final class QuestionPayloads {

    private QuestionPayloads() {
    }

    public record Option(String key, String text) {
    }

    public record Content(List<Option> options) {
    }

    public record AnswerKey(List<String> selectedKeys, List<String> acceptedAnswers,
                            String modelAnswer, String rubric) {
    }
}
