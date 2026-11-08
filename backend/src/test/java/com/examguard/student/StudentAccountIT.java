package com.examguard.student;

import com.examguard.domain.Attempt;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StudentAccountIT extends ApiTestBase {

    private static final String PASSWORD = "StudentPass123!";

    @Autowired
    private LoginThrottle loginThrottle;

    @Test
    void registerLoginAndReadOwnProfile() throws Exception {
        String email = email();
        mvc.perform(post("/api/student/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", email, "password", PASSWORD, "displayName", "Student One"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.user.displayName").value("Student One"))
                .andExpect(jsonPath("$.user.id").isNumber());

        String token = login(email, PASSWORD)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String bearer = "Bearer " + json.readTree(token).get("token").asText();
        mvc.perform(get("/api/student/me").header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.displayName").value("Student One"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        String email = email();
        mvc.perform(post("/api/student/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", email, "password", PASSWORD, "displayName", "First"))))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/student/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", email, "password", PASSWORD, "displayName", "Second"))))
                .andExpect(status().isConflict());
    }

    @Test
    void shortPasswordIsRejected() throws Exception {
        mvc.perform(post("/api/student/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", email(), "password", "short", "displayName", "Short"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void joiningLinksTheAttemptAndListsItForTheStudent() throws Exception {
        Exam exam = openExam();
        String bearer = registerAndLogin();

        String joinedBody = join(bearer, exam.getCode(), "C-" + UUID.randomUUID())
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long attemptId = json.readTree(joinedBody).get("attemptId").asLong();

        Attempt attempt = attemptRepository.findById(attemptId).orElseThrow();
        assertThat(attempt.getStudentUser()).isNotNull();

        mvc.perform(get("/api/student/attempts").header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].attemptId").value(attemptId))
                .andExpect(jsonPath("$[0].examCode").value(exam.getCode()))
                .andExpect(jsonPath("$[0].examTitle").value(exam.getTitle()))
                .andExpect(jsonPath("$[0].status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$[0].released").value(false))
                .andExpect(jsonPath("$[0].strikes").value(0));
    }

    @Test
    void secondAccountCannotTakeOverALinkedAttempt() throws Exception {
        Exam exam = openExam();
        String first = registerAndLogin();
        String second = registerAndLogin();
        String candidateCode = "C-" + UUID.randomUUID();

        join(first, exam.getCode(), candidateCode).andExpect(status().isOk());
        join(second, exam.getCode(), candidateCode)
                .andExpect(status().isConflict());
    }

    @Test
    void repeatedLoginFailuresAreThrottled() throws Exception {
        String email = email();
        register(email);
        loginThrottle.clear("127.0.0.1");
        try {
            for (int attemptNo = 0; attemptNo < 5; attemptNo++) {
                login(email, "WrongPassword1!").andExpect(status().isUnauthorized());
            }
            login(email, PASSWORD).andExpect(status().isTooManyRequests());
        } finally {
            loginThrottle.clear("127.0.0.1");
        }
    }

    private Exam openExam() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "STU-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                ExamStatus.OPEN);
        question(exam, 1);
        return exam;
    }

    private String registerAndLogin() throws Exception {
        String email = email();
        register(email);
        String body = mvc.perform(post("/api/student/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "password", PASSWORD))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + json.readTree(body).get("token").asText();
    }

    private void register(String email) throws Exception {
        mvc.perform(post("/api/student/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", email, "password", PASSWORD, "displayName", "Student " + email))))
                .andExpect(status().isCreated());
    }

    private org.springframework.test.web.servlet.ResultActions login(String email, String password)
            throws Exception {
        return mvc.perform(post("/api/student/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private org.springframework.test.web.servlet.ResultActions join(String bearer, String examCode,
                                                                    String candidateCode) throws Exception {
        return mvc.perform(post("/api/student/attempts/join")
                .header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "examCode", examCode, "candidateCode", candidateCode))));
    }

    private JsonNode read(String body) {
        try {
            return json.readTree(body);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private String email() {
        return "student-" + UUID.randomUUID() + "@test.local";
    }
}
