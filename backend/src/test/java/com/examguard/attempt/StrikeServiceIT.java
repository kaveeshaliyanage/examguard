package com.examguard.attempt;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.IntegrityEventRepository;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StrikeServiceIT extends ApiTestBase {

    @Autowired
    private IntegrityEventRepository integrityEventRepository;

    @Test
    void duplicateEpisodeKeyOnlyCountsOneStrike() throws Exception {
        Exam exam = openExam();
        JsonNode joined = join(exam);
        long attemptId = joined.get("attemptId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();

        signal(token, attemptId, "episode-1", "FOCUS_LOSS")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.strikeCount").value(1))
                .andExpect(jsonPath("$.terminated").value(false));
        signal(token, attemptId, "episode-1", "FOCUS_LOSS")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.strikeCount").value(1));

        assertThat(integrityEventRepository.countByAttemptId(attemptId)).isEqualTo(1);
    }

    @Test
    void thirdStrikeTerminatesAndBlocksFurtherAnswers() throws Exception {
        Exam exam = openExam();
        JsonNode joined = join(exam);
        long attemptId = joined.get("attemptId").asLong();
        long questionId = joined.get("answers").get(0).get("questionId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();

        signal(token, attemptId, "episode-1", "FOCUS_LOSS")
                .andExpect(jsonPath("$.strikeCount").value(1))
                .andExpect(jsonPath("$.terminated").value(false));
        signal(token, attemptId, "episode-2", "FOCUS_LOSS")
                .andExpect(jsonPath("$.strikeCount").value(2));
        signal(token, attemptId, "episode-3", "FOCUS_LOSS")
                .andExpect(jsonPath("$.strikeCount").value(3))
                .andExpect(jsonPath("$.maxStrikes").value(3))
                .andExpect(jsonPath("$.terminated").value(true))
                .andExpect(jsonPath("$.status").value("TERMINATED"));

        Attempt attempt = attemptRepository.findById(attemptId).orElseThrow();
        assertThat(attempt.getStatus()).isEqualTo(AttemptStatus.TERMINATED);
        assertThat(attempt.getTerminatedAt()).isNotNull();
        assertThat(attempt.getTerminationReason()).isEqualTo("FOCUS_LOSS_LIMIT");

        mvc.perform(get("/api/attempts/" + attemptId).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("TERMINATED"))
                .andExpect(jsonPath("$.strikeCount").value(3))
                .andExpect(jsonPath("$.terminationReason").value("FOCUS_LOSS_LIMIT"));

        mvc.perform(put("/api/attempts/" + attemptId + "/answers/" + questionId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", "too late", "clientSeq", 2))))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/attempts/" + attemptId + "/submit").header("Authorization", token))
                .andExpect(status().isConflict());
    }

    @Test
    void nonFocusLossSignalsAreStoredWithoutStrikes() throws Exception {
        Exam exam = openExam();
        JsonNode joined = join(exam);
        long attemptId = joined.get("attemptId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();

        signal(token, attemptId, "focus-1", "FOCUS_LOSS")
                .andExpect(jsonPath("$.strikeCount").value(1));
        signal(token, attemptId, "return-1", "FOCUS_RETURN")
                .andExpect(jsonPath("$.strikeCount").value(1));
        signal(token, attemptId, "hidden-1", "VISIBILITY_HIDDEN")
                .andExpect(jsonPath("$.strikeCount").value(1));

        assertThat(integrityEventRepository.countByAttemptId(attemptId)).isEqualTo(3);
    }

    @Test
    void autosaveAfterAStrikeDoesNotResetTheCounter() throws Exception {
        Exam exam = openExam();
        JsonNode joined = join(exam);
        long attemptId = joined.get("attemptId").asLong();
        long questionId = joined.get("answers").get(0).get("questionId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();

        save(token, attemptId, questionId, "first answer", 1).andExpect(status().isOk());
        signal(token, attemptId, "episode-1", "FOCUS_LOSS")
                .andExpect(jsonPath("$.strikeCount").value(1));

        save(token, attemptId, questionId, "second answer", 2).andExpect(status().isOk());

        mvc.perform(get("/api/attempts/" + attemptId).header("Authorization", token))
                .andExpect(jsonPath("$.strikeCount").value(1));
        assertThat(attemptRepository.findById(attemptId).orElseThrow().getStrikeCount()).isEqualTo(1);
    }

    private Exam openExam() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "STRIKE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                ExamStatus.OPEN);
        question(exam, 1);
        return exam;
    }

    private JsonNode join(Exam exam) throws Exception {
        String body = json.writeValueAsString(
                Map.of("examCode", exam.getCode(), "candidateCode", "STRIKE-" + UUID.randomUUID()));
        String response = mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response);
    }

    private org.springframework.test.web.servlet.ResultActions save(
            String token, long attemptId, long questionId, String text, long clientSeq) throws Exception {
        String body = json.writeValueAsString(Map.of("text", text, "clientSeq", clientSeq));
        return mvc.perform(put("/api/attempts/" + attemptId + "/answers/" + questionId)
                .header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private org.springframework.test.web.servlet.ResultActions signal(
            String token, long attemptId, String episodeKey, String type) throws Exception {
        String body = json.writeValueAsString(Map.of(
                "episodeKey", episodeKey,
                "signal", type,
                "occurredAt", Instant.now().toString()));
        return mvc.perform(post("/api/attempts/" + attemptId + "/integrity/signals")
                .header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }
}
