package com.examguard.exam;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ExamSettingsApiTest extends ApiTestBase {

    @Test
    void ownerUpdatesSettingsAndTheChangeIsAudited() throws Exception {
        User owner = staff(Role.LECTURER);
        String code = uniqueCode();
        long examId = createExam(owner, code);

        Instant opensAt = Instant.now().plus(1, ChronoUnit.HOURS);
        Instant closesAt = Instant.now().plus(3, ChronoUnit.HOURS);
        Map<String, Object> settings = settingsBody("Updated title", 90, 5, opensAt, closesAt,
                List.of(
                        Map.of("category", "PROHIBITED", "domainPattern", "*.chat.example", "note", "No chat"),
                        Map.of("category", "PERMITTED", "domainPattern", "*.edu", "note", "University")));

        mvc.perform(patch("/api/exams/" + examId)
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(settings)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.title").value("Updated title"))
                .andExpect(jsonPath("$.durationMinutes").value(90))
                .andExpect(jsonPath("$.maxStrikes").value(5))
                .andExpect(jsonPath("$.allowExtension").value(false))
                .andExpect(jsonPath("$.instructions").value("No calculators"))
                .andExpect(jsonPath("$.opensAt").isNotEmpty())
                .andExpect(jsonPath("$.closesAt").isNotEmpty())
                .andExpect(jsonPath("$.resourceRules.length()").value(2))
                .andExpect(jsonPath("$.resourceRules[0].category").value("PROHIBITED"))
                .andExpect(jsonPath("$.resourceRules[0].note").value("No chat"));

        Exam reloaded = examRepository.findById(examId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(reloaded.getCode()).isEqualTo(code);
        org.assertj.core.api.Assertions.assertThat(reloaded.getDurationMinutes()).isEqualTo(90);

        mvc.perform(get("/api/exams/" + examId + "/audit").header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.action == 'EXAM_SETTINGS_UPDATED')]").exists());
    }

    @Test
    void creatingAnExamCanSetItsSchedule() throws Exception {
        User owner = staff(Role.LECTURER);
        Instant opensAt = Instant.now().plus(2, ChronoUnit.HOURS);
        Instant closesAt = Instant.now().plus(4, ChronoUnit.HOURS);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", uniqueCode());
        body.put("title", "Scheduled exam");
        body.put("durationMinutes", 60);
        body.put("opensAt", opensAt.toString());
        body.put("closesAt", closesAt.toString());
        body.put("questions", List.of(Map.of("prompt", "What is a WAL?", "maxWords", 200)));

        mvc.perform(post("/api/exams")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.opensAt").isNotEmpty())
                .andExpect(jsonPath("$.closesAt").isNotEmpty())
                .andExpect(jsonPath("$.enrollmentCount").value(0));
    }

    @Test
    void windowMustCloseAfterItOpens() throws Exception {
        User owner = staff(Role.LECTURER);
        long examId = createExam(owner, uniqueCode());
        Instant opensAt = Instant.now().plus(2, ChronoUnit.HOURS);
        Instant closesAt = Instant.now().plus(1, ChronoUnit.HOURS);

        mvc.perform(patch("/api/exams/" + examId)
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(settingsBody("Bad window", 60, 3, opensAt, closesAt,
                                List.of()))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void settingsAreValidated() throws Exception {
        User owner = staff(Role.LECTURER);
        long examId = createExam(owner, uniqueCode());

        mvc.perform(patch("/api/exams/" + examId)
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(settingsBody("Too short", 2, 3, null, null,
                                List.of()))))
                .andExpect(status().isBadRequest());

        mvc.perform(patch("/api/exams/" + examId)
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(settingsBody("Too many strikes", 60, 11, null, null,
                                List.of()))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nonOwnerCannotUpdateSettings() throws Exception {
        User owner = staff(Role.LECTURER);
        User outsider = staff(Role.LECTURER);
        long examId = createExam(owner, uniqueCode());

        mvc.perform(patch("/api/exams/" + examId)
                        .header("Authorization", bearer(outsider))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(settingsBody("Hijacked", 60, 3, null, null,
                                List.of()))))
                .andExpect(status().isForbidden());

        Exam reloaded = examRepository.findById(examId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(reloaded.getTitle()).isNotEqualTo("Hijacked");
        org.assertj.core.api.Assertions.assertThat(reloaded.getStatus()).isEqualTo(ExamStatus.DRAFT);
    }

    private long createExam(User owner, String code) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("title", "Original title");
        body.put("durationMinutes", 60);
        body.put("questions", List.of(Map.of("prompt", "Explain a write-ahead log.", "maxWords", 250)));
        body.put("resourceRules", List.of(Map.of("category", "PERMITTED", "domainPattern", "*.edu")));

        String response = mvc.perform(post("/api/exams")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("id").asLong();
    }

    private Map<String, Object> settingsBody(String title, int durationMinutes, int maxStrikes,
                                             Instant opensAt, Instant closesAt,
                                             List<Map<String, Object>> rules) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("description", "Updated description");
        body.put("durationMinutes", durationMinutes);
        body.put("allowExtension", false);
        body.put("maxStrikes", maxStrikes);
        body.put("instructions", "No calculators");
        body.put("opensAt", opensAt == null ? null : opensAt.toString());
        body.put("closesAt", closesAt == null ? null : closesAt.toString());
        body.put("resourceRules", rules);
        return body;
    }

    private String uniqueCode() {
        return "SET-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
}
