package com.examguard.student;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AccessScopeIT extends ApiTestBase {

    private static final String PASSWORD = "StudentPass123!";

    @Autowired
    private LoginThrottle loginThrottle;

    @Test
    void attemptTokenIsRejectedOnStudentAccountEndpoints() throws Exception {
        Exam exam = openExam();
        JsonNode joined = guestJoin(exam);
        String attemptToken = "Bearer " + joined.get("sessionToken").asText();

        mvc.perform(get("/api/student/me").header("Authorization", attemptToken))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/student/attempts").header("Authorization", attemptToken))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/student/attempts/join")
                        .header("Authorization", attemptToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "examCode", exam.getCode(), "candidateCode", "X"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void accountTokenOnlyReachesItsOwnLinkedAttempt() throws Exception {
        Exam exam = openExam();
        String ownerToken = registerAndLogin();
        String otherToken = registerAndLogin();
        String candidateCode = "C-" + UUID.randomUUID();

        String joinedBody = mvc.perform(post("/api/student/attempts/join")
                        .header("Authorization", ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "examCode", exam.getCode(), "candidateCode", candidateCode))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long attemptId = json.readTree(joinedBody).get("attemptId").asLong();

        mvc.perform(get("/api/attempts/" + attemptId).header("Authorization", otherToken))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/attempts/" + attemptId + "/submit").header("Authorization", otherToken))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/attempts/" + attemptId + "/integrity/signals")
                        .header("Authorization", otherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "episodeKey", "cross-1",
                                "signal", "FOCUS_LOSS",
                                "occurredAt", java.time.Instant.now().toString()))))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/attempts/" + attemptId).header("Authorization", ownerToken))
                .andExpect(status().isOk());
    }

    @Test
    void staffTokenStillReachesAttemptState() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "SCOPE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                ExamStatus.OPEN);
        question(exam, 1);
        JsonNode joined = guestJoin(exam);

        mvc.perform(get("/api/attempts/" + joined.get("attemptId").asLong())
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk());
    }

    private Exam openExam() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "SCOPE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                ExamStatus.OPEN);
        question(exam, 1);
        return exam;
    }

    private JsonNode guestJoin(Exam exam) throws Exception {
        String body = json.writeValueAsString(Map.of(
                "examCode", exam.getCode(), "candidateCode", "C-" + UUID.randomUUID()));
        String response = mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response);
    }

    private String registerAndLogin() throws Exception {
        String email = "scope-" + UUID.randomUUID() + "@test.local";
        loginThrottle.clear("127.0.0.1");
        mvc.perform(post("/api/student/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", email, "password", PASSWORD, "displayName", "Scope Student"))))
                .andExpect(status().isCreated());
        String body = mvc.perform(post("/api/student/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "password", PASSWORD))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + json.readTree(body).get("token").asText();
    }
}
