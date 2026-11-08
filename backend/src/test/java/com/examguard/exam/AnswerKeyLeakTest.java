package com.examguard.exam;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AnswerKeyLeakTest extends ApiTestBase {

    private static final String SECRET_EXPLANATION = "HIDDEN-EXPLANATION-" + UUID.randomUUID();

    @Test
    void studentFacingStateNeverCarriesAnswerKeyOrExplanation() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "LEAK-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                ExamStatus.OPEN);
        questionWithKey(exam);

        String joinBody = json.writeValueAsString(
                Map.of("examCode", exam.getCode(), "candidateCode", "LEAK-1"));
        String joined = mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON).content(joinBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        JsonNode joinJson = json.readTree(joined);
        assertNoLeak(joinJson);
        assertThat(joinJson.toString()).contains("options");

        long attemptId = joinJson.get("attemptId").asLong();
        String token = "Bearer " + joinJson.get("sessionToken").asText();
        String state = mvc.perform(get("/api/attempts/" + attemptId).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.exam.questions[0].type").value("SINGLE_CHOICE"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.exam.questions[0].points").value(2.00))
                .andReturn().getResponse().getContentAsString();

        assertNoLeak(json.readTree(state));
    }

    @Test
    void staffExamDetailStillCarriesAnswerKeyAndExplanation() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "LEAK-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                ExamStatus.DRAFT);
        questionWithKey(exam);

        String body = mvc.perform(get("/api/exams/" + exam.getId()).header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        JsonNode detail = json.readTree(body);
        JsonNode question = detail.get("questions").get(0);
        assertThat(question.get("answerKey").get("selectedKeys").get(0).asText()).isEqualTo("B");
        assertThat(question.get("explanation").asText()).isEqualTo(SECRET_EXPLANATION);
    }

    private void assertNoLeak(JsonNode node) {
        String serialised = node.toString();
        assertThat(serialised)
                .doesNotContain("answerKey")
                .doesNotContain("selectedKeys")
                .doesNotContain("explanation")
                .doesNotContain(SECRET_EXPLANATION);
    }

    private Question questionWithKey(Exam exam) {
        Question question = new Question();
        question.setExam(exam);
        question.setOrderIndex(1);
        question.setPrompt("Which storage engine is transactional?");
        question.setMaxWords(0);
        question.setType(QuestionType.SINGLE_CHOICE);
        question.setPoints(new BigDecimal("2.00"));
        question.setGradingMode(GradingMode.AUTO);
        question.setContentJson("{\"options\":[{\"key\":\"A\",\"text\":\"MyISAM\"},"
                + "{\"key\":\"B\",\"text\":\"InnoDB\"}]}");
        question.setAnswerKeyJson("{\"selectedKeys\":[\"B\"]}");
        question.setExplanation(SECRET_EXPLANATION);
        return questionRepository.save(question);
    }
}
