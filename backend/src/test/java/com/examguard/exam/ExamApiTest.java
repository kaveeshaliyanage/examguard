package com.examguard.exam;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ExamApiTest extends ApiTestBase {

    private String uniqueCode() {
        return "EX-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    private Map<String, Object> createBody(String code) {
        return Map.of(
                "code", code,
                "title", "Networks midterm",
                "description", "Two-question test exam",
                "durationMinutes", 60,
                "questions", List.of(
                        Map.of("prompt", "Explain a write-ahead log.", "maxWords", 250),
                        Map.of("prompt", "Explain Manifest V3 background work.", "maxWords", 250)),
                "resourceRules", List.of(
                        Map.of("category", "PERMITTED", "domainPattern", "*.edu", "note", "University")));
    }

    @Test
    void lecturerCreatesDraftExamAndOwnsIt() throws Exception {
        User lecturer = staff(Role.LECTURER);
        String code = uniqueCode();

        mvc.perform(post("/api/exams")
                        .header("Authorization", bearer(lecturer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(createBody(code))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.questions.length()").value(2))
                .andExpect(jsonPath("$.resourceRules[0].category").value("PERMITTED"))
                .andExpect(jsonPath("$.permissions[0].level").value("OWNER"));
    }

    @Test
    void duplicateExamCodeIsRejected() throws Exception {
        User lecturer = staff(Role.LECTURER);
        String code = uniqueCode();
        String body = json.writeValueAsString(createBody(code));

        mvc.perform(post("/api/exams").header("Authorization", bearer(lecturer))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/exams").header("Authorization", bearer(lecturer))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void reviewerCannotCreateExamButAdminCan() throws Exception {
        User reviewer = staff(Role.REVIEWER);
        mvc.perform(post("/api/exams").header("Authorization", bearer(reviewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(createBody(uniqueCode()))))
                .andExpect(status().isForbidden());

        User admin = staff(Role.ADMIN);
        mvc.perform(post("/api/exams").header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(createBody(uniqueCode()))))
                .andExpect(status().isCreated());
    }

    @Test
    void statusOnlyMovesDraftToOpenToClosed() throws Exception {
        User lecturer = staff(Role.LECTURER);
        Exam exam = exam(lecturer, uniqueCode(), ExamStatus.DRAFT);

        mvc.perform(patch("/api/exams/" + exam.getId() + "/status")
                        .header("Authorization", bearer(lecturer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"OPEN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"));

        mvc.perform(patch("/api/exams/" + exam.getId() + "/status")
                        .header("Authorization", bearer(lecturer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"OPEN\"}"))
                .andExpect(status().isConflict());

        mvc.perform(patch("/api/exams/" + exam.getId() + "/status")
                        .header("Authorization", bearer(lecturer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CLOSED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"));
    }

    @Test
    void grantedReviewerCanViewExamButUnrelatedLecturerCannot() throws Exception {
        User owner = staff(Role.LECTURER);
        User invited = staff(Role.LECTURER);
        User outsider = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.DRAFT);

        mvc.perform(post("/api/exams/" + exam.getId() + "/permissions")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("userId", invited.getId(), "level", PermissionLevel.REVIEWER.name()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.level").value("REVIEWER"));

        mvc.perform(get("/api/exams/" + exam.getId()).header("Authorization", bearer(invited)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/exams/" + exam.getId()).header("Authorization", bearer(outsider)))
                .andExpect(status().isForbidden());

        mvc.perform(delete("/api/exams/" + exam.getId() + "/permissions/" + invited.getId())
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/exams/" + exam.getId()).header("Authorization", bearer(invited)))
                .andExpect(status().isForbidden());
    }

    @Test
    void permissionCanBeGrantedByEmail() throws Exception {
        User owner = staff(Role.LECTURER);
        User invited = staff(Role.REVIEWER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.DRAFT);

        mvc.perform(post("/api/exams/" + exam.getId() + "/permissions")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("email", invited.getEmail(), "level", PermissionLevel.VIEWER.name()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(invited.getId()))
                .andExpect(jsonPath("$.level").value("VIEWER"));

        mvc.perform(get("/api/exams/" + exam.getId()).header("Authorization", bearer(invited)))
                .andExpect(status().isOk());
    }

    @Test
    void examMustKeepAtLeastOneOwner() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.DRAFT);

        mvc.perform(delete("/api/exams/" + exam.getId() + "/permissions/" + owner.getId())
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isConflict());
    }

    @Test
    void examCreationWritesAnAuditRow() throws Exception {
        User lecturer = staff(Role.LECTURER);
        String code = uniqueCode();

        mvc.perform(post("/api/exams").header("Authorization", bearer(lecturer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(createBody(code))))
                .andExpect(status().isCreated());

        Long examId = examRepository.findByCodeIgnoreCase(code).orElseThrow().getId();
        mvc.perform(get("/api/exams/" + examId + "/audit").header("Authorization", bearer(lecturer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.action == 'EXAM_CREATED')]").exists());
    }
}
