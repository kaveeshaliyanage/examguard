package com.examguard.attempt;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AttemptApiTest extends ApiTestBase {

    private String uniqueCode() {
        return "AT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    private JsonNode join(String examCode, String candidateCode) throws Exception {
        String body = json.writeValueAsString(Map.of("examCode", examCode, "candidateCode", candidateCode));
        String response = mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response);
    }

    @Test
    void joinRequiresOpenExamAndIsIdempotentForTheSameCandidate() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam openExam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(openExam, 1);

        JsonNode first = join(openExam.getCode(), "S-001");
        JsonNode second = join(openExam.getCode(), "S-001");

        assertThat(first.get("attemptId").asLong()).isEqualTo(second.get("attemptId").asLong());
        assertThat(first.get("sessionToken").asText()).isNotBlank();
        assertThat(first.get("collectorToken").asText()).isNotBlank();
        assertThat(first.get("answers")).hasSize(1);
        assertThat(first.get("serverNow").asText()).isNotBlank();

        Exam closedExam = exam(owner, uniqueCode(), ExamStatus.CLOSED);
        mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("examCode", closedExam.getCode(), "candidateCode", "S-001"))))
                .andExpect(status().isConflict());
    }

    @Test
    void autosaveCreatesRevisionsOnlyForNewerChangedText() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        JsonNode joined = join(exam.getCode(), "S-002");
        long attemptId = joined.get("attemptId").asLong();
        long questionId = joined.get("answers").get(0).get("questionId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();

        saveAnswer(token, attemptId, questionId, "A write-ahead log persists changes before pages.", 1)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revisionNo").value(1));

        saveAnswer(token, attemptId, questionId, "A write-ahead log persists changes before pages.", 2)
                .andExpect(jsonPath("$.revisionNo").value(1));

        saveAnswer(token, attemptId, questionId, "A write-ahead log records redo before pages flush.", 3)
                .andExpect(jsonPath("$.revisionNo").value(2));

        saveAnswer(token, attemptId, questionId, "Stale autosave from an old tab", 1)
                .andExpect(jsonPath("$.revisionNo").value(2));

        assertThat(revisionRepository.countByAttemptId(attemptId)).isEqualTo(2);
    }

    @Test
    void attemptTokenCannotReadOrWriteAnotherAttempt() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        JsonNode first = join(exam.getCode(), "S-003");
        JsonNode second = join(exam.getCode(), "S-004");

        String secondToken = "Bearer " + second.get("sessionToken").asText();
        mvc.perform(get("/api/attempts/" + first.get("attemptId").asLong())
                        .header("Authorization", secondToken))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/attempts/" + first.get("attemptId").asLong()
                        + "/answers/" + first.get("answers").get(0).get("questionId").asLong())
                        .header("Authorization", secondToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"hijacked\",\"clientSeq\":1}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void eventsAreDeduplicatedFilteredAndCountTowardCoverage() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        JsonNode joined = join(exam.getCode(), "S-005");
        long attemptId = joined.get("attemptId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();
        String now = Instant.now().toString();

        List<Map<String, Object>> events = List.of(
                Map.of("clientEventId", "e-1", "eventType", "EXTENSION_CONNECTED", "occurredAt", now),
                Map.of("clientEventId", "e-2", "eventType", "NAVIGATION", "domain", "https://chegg.com/questions/1",
                        "occurredAt", now, "tabId", 4),
                Map.of("clientEventId", "e-1", "eventType", "EXTENSION_CONNECTED", "occurredAt", now),
                Map.of("clientEventId", "e-3", "eventType", "NAVIGATION", "domain", "not a domain",
                        "occurredAt", now),
                Map.of("clientEventId", "e-4", "eventType", "HEARTBEAT", "occurredAt", now,
                        "metadata", Map.of("pageText", "should never be accepted")));

        mvc.perform(post("/api/attempts/" + attemptId + "/events")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("events", events))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(2))
                .andExpect(jsonPath("$.duplicates").value(1))
                .andExpect(jsonPath("$.rejected").value(2));

        mvc.perform(post("/api/attempts/" + attemptId + "/heartbeat")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "lastSeenAt", now, "eventCount", 2,
                                "domainsObserved", 1, "extensionConnected", true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.extensionConnected").value(true))
                .andExpect(jsonPath("$.eventCount").value(2))
                .andExpect(jsonPath("$.warning").value(true));
    }

    @Test
    void submitIsIdempotentAndClosesTheAttempt() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        JsonNode joined = join(exam.getCode(), "S-006");
        long attemptId = joined.get("attemptId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();

        String first = mvc.perform(post("/api/attempts/" + attemptId + "/submit")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andReturn().getResponse().getContentAsString();
        String second = mvc.perform(post("/api/attempts/" + attemptId + "/submit")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(json.readTree(second).get("submittedAt").asText())
                .isEqualTo(json.readTree(first).get("submittedAt").asText());

        saveAnswer(token, attemptId,
                joined.get("answers").get(0).get("questionId").asLong(), "too late", 9)
                .andExpect(status().isConflict());

        String rejoinBody = json.writeValueAsString(
                Map.of("examCode", exam.getCode(), "candidateCode", "S-006"));
        mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON).content(rejoinBody))
                .andExpect(status().isConflict());
    }

    @Test
    void ownerCanReadAttemptButUnrelatedLecturerCannot() throws Exception {
        User owner = staff(Role.LECTURER);
        User outsider = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        long attemptId = join(exam.getCode(), "S-007").get("attemptId").asLong();

        mvc.perform(get("/api/attempts/" + attemptId).header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        mvc.perform(get("/api/attempts/" + attemptId).header("Authorization", bearer(outsider)))
                .andExpect(status().isForbidden());
    }

    private org.springframework.test.web.servlet.ResultActions saveAnswer(
            String token, long attemptId, long questionId, String text, long clientSeq) throws Exception {
        return mvc.perform(put("/api/attempts/" + attemptId + "/answers/" + questionId)
                .header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text", text, "clientSeq", clientSeq))));
    }
}
