package com.examguard.exam;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ExamRosterITest extends ApiTestBase {

    private static final String PASSWORD = "RosterPass123!";

    @Test
    void ownerAddsListsAndRemovesRosterEntries() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = openExam(owner, null);

        String created = mvc.perform(post("/api/exams/" + exam.getId() + "/roster")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", "Student.One@Example.COM"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("student.one@example.com"))
                .andReturn().getResponse().getContentAsString();
        long entryId = json.readTree(created).get("id").asLong();

        mvc.perform(get("/api/exams/" + exam.getId() + "/roster")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].email").value("student.one@example.com"));

        mvc.perform(get("/api/exams/" + exam.getId()).header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrollmentCount").value(1));

        mvc.perform(delete("/api/exams/" + exam.getId() + "/roster/" + entryId)
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/exams/" + exam.getId() + "/roster")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void duplicateEnrollmentIsRejectedRegardlessOfCase() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = openExam(owner, null);

        enroll(owner, exam, "dup@example.com").andExpect(status().isCreated());
        enroll(owner, exam, "DUP@Example.com").andExpect(status().isConflict());
    }

    @Test
    void onlyExamViewersCanReadAndOnlyTheOwnerCanWrite() throws Exception {
        User owner = staff(Role.LECTURER);
        User outsider = staff(Role.LECTURER);
        User reviewer = staff(Role.REVIEWER);
        Exam exam = openExam(owner, null);
        grant(exam, reviewer, com.examguard.domain.PermissionLevel.REVIEWER);

        mvc.perform(get("/api/exams/" + exam.getId() + "/roster")
                        .header("Authorization", bearer(reviewer)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/exams/" + exam.getId() + "/roster")
                        .header("Authorization", bearer(outsider)))
                .andExpect(status().isForbidden());
        enroll(outsider, exam, "sneaky@example.com").andExpect(status().isForbidden());
    }

    @Test
    void nonEmptyRosterLocksJoinToEnrolledAccounts() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = openExam(owner, null);
        String enrolledEmail = "enrolled-" + UUID.randomUUID() + "@test.local";
        enroll(owner, exam, enrolledEmail.toUpperCase()).andExpect(status().isCreated());

        joinGuest(exam.getCode(), "G-1").andExpect(status().isForbidden());

        String unenrolled = registerStudent("unenrolled-" + UUID.randomUUID() + "@test.local");
        joinWithToken(unenrolled, exam.getCode(), "C-1").andExpect(status().isForbidden());

        String enrolled = registerStudent(enrolledEmail);
        String body = joinWithToken(enrolled, exam.getCode(), "C-2")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long attemptId = json.readTree(body).get("attemptId").asLong();
        assertThat(attemptRepository.findById(attemptId).orElseThrow().getStudentUser()).isNotNull();
    }

    @Test
    void emptyRosterKeepsPublicCodeJoinOpen() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = openExam(owner, null);
        joinGuest(exam.getCode(), "G-2").andExpect(status().isOk());
    }

    @Test
    void scheduleBlocksNewJoinsOutsideTheWindow() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam future = openExam(owner, Instant.now().plus(1, ChronoUnit.HOURS));
        joinGuest(future.getCode(), "G-3")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("This exam opens at")));

        Exam past = openExam(owner, null);
        past.setOpensAt(Instant.now().minus(2, ChronoUnit.HOURS));
        past.setClosesAt(Instant.now().minus(1, ChronoUnit.HOURS));
        examRepository.save(past);
        joinGuest(past.getCode(), "G-4")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("This exam closed at")));
    }

    @Test
    void inProgressAttemptCanResumeAfterTheExamCloses() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = openExam(owner, null);
        exam.setOpensAt(Instant.now().minus(1, ChronoUnit.HOURS));
        exam.setClosesAt(Instant.now().plus(1, ChronoUnit.HOURS));
        examRepository.save(exam);

        String first = joinGuest(exam.getCode(), "G-5").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String resumeToken = json.readTree(first).get("sessionToken").asText();

        exam.setClosesAt(Instant.now().minus(1, ChronoUnit.MINUTES));
        examRepository.save(exam);

        joinGuest(exam.getCode(), "G-5", resumeToken).andExpect(status().isOk());
        joinGuest(exam.getCode(), "G-6").andExpect(status().isConflict());
    }

    private Exam openExam(User owner, Instant opensAt) {
        Exam exam = exam(owner, "RST-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                ExamStatus.OPEN);
        exam.setOpensAt(opensAt);
        exam.setClosesAt(Instant.now().plus(2, ChronoUnit.HOURS));
        question(exam, 1);
        return examRepository.save(exam);
    }

    private ResultActions enroll(User actor, Exam exam, String email) throws Exception {
        return mvc.perform(post("/api/exams/" + exam.getId() + "/roster")
                .header("Authorization", bearer(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email))));
    }

    private ResultActions joinGuest(String examCode, String candidateCode) throws Exception {
        return mvc.perform(post("/api/public/join")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "examCode", examCode, "candidateCode", candidateCode))));
    }

    private ResultActions joinGuest(String examCode, String candidateCode, String resumeToken)
            throws Exception {
        return mvc.perform(post("/api/public/join")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "examCode", examCode, "candidateCode", candidateCode,
                        "resumeToken", resumeToken))));
    }

    private ResultActions joinWithToken(String bearer, String examCode, String candidateCode)
            throws Exception {
        return mvc.perform(post("/api/student/attempts/join")
                .header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "examCode", examCode, "candidateCode", candidateCode))));
    }

    private String registerStudent(String email) throws Exception {
        String body = mvc.perform(post("/api/student/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", email, "password", PASSWORD, "displayName", "Roster Student"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(body);
        return "Bearer " + node.get("token").asText();
    }
}
