package com.examguard.exam;

import com.examguard.domain.CodeLanguage;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class QuestionPayloads {

    private QuestionPayloads() {
    }

    public record Option(String key, String text) {
    }

    /** Visible to candidates: the language and the scaffold they start from. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Content(
            List<Option> options,
            CodeLanguage language,
            @Size(max = 10000) String starterCode) {

        public Content(List<Option> options) {
            this(options, null, null);
        }
    }

    public record CodeTest(
            @Size(max = 200) String name,
            @Size(max = 4000) String input,
            @NotBlank @Size(max = 4000) String expectedOutput,
            Boolean hidden) {
    }

    /** Staff-only: never included in the candidate-facing question view. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AnswerKey(
            List<String> selectedKeys,
            List<String> acceptedAnswers,
            @Size(max = 10000) String modelAnswer,
            @Size(max = 8000) String rubric,
            @Size(max = 20) List<CodeTest> tests) {

        public AnswerKey(List<String> selectedKeys, List<String> acceptedAnswers,
                         String modelAnswer, String rubric) {
            this(selectedKeys, acceptedAnswers, modelAnswer, rubric, null);
        }
    }
}
