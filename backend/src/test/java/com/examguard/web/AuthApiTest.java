package com.examguard.web;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthApiTest extends ApiTestBase {

    @Test
    void loginReturnsStaffTokenAndCurrentUser() throws Exception {
        User lecturer = staff(Role.LECTURER);

        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("email", lecturer.getEmail(), "password", "TestPassword123!"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("LECTURER"))
                .andExpect(jsonPath("$.user.email").value(lecturer.getEmail()))
                .andReturn().getResponse().getContentAsString();

        String token = json.readTree(body).get("token").asText();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value(lecturer.getDisplayName()));
    }

    @Test
    void wrongPasswordAndUnknownEmailAreUnauthorized() throws Exception {
        User lecturer = staff(Role.LECTURER);

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("email", lecturer.getEmail(), "password", "WrongPassword123!"))))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("email", "nobody-" + UUID.randomUUID() + "@test.local",
                                        "password", "TestPassword123!"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void studentTokenCannotCallStaffEndpoints() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "AUTH-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.OPEN);
        question(exam, 1);

        String joined = mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("examCode", exam.getCode(), "candidateCode", "AUTH-S1"))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode body = json.readTree(joined);
        String studentToken = "Bearer " + body.get("sessionToken").asText();

        mvc.perform(get("/api/exams").header("Authorization", studentToken))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/exams/" + exam.getId()).header("Authorization", studentToken))
                .andExpect(status().isForbidden());
    }
}
