package com.examguard.attempt;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamEnrollment;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.ExamEnrollmentRepository;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers the PIN gate on new joins and the supervised pre-exam window that starts the clock.
 * Course-style exams in {@link ApiTestBase#exam} opt out of both; these tests turn them on.
 */
class PinPreflightApiTest extends ApiTestBase {

    @Autowired
    private ExamEnrollmentRepository enrollmentRepository;
    @Autowired
    private AttemptExpiryService expiryService;

    private String uniqueCode() {
        return "PP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    private User student() {
        User user = new User();
        user.setEmail("student-" + UUID.randomUUID() + "@test.local");
        user.setDisplayName("Test Student");
        user.setPasswordHash(passwordEncoder.encode("TestPassword123!"));
        user.setRole(Role.STUDENT);
        user.setEnabled(true);
        return userRepository.save(user);
    }

    private void enroll(Exam exam, String email) {
        ExamEnrollment enrollment = new ExamEnrollment();
        enrollment.setExam(exam);
        enrollment.setEmail(email);
        enrollmentRepository.save(enrollment);
    }

    private JsonNode issuePin(User owner, Exam exam) throws Exception {
        String body = mvc.perform(post("/api/exams/" + exam.getId() + "/pin")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private org.springframework.test.web.servlet.ResultActions joinWithPin(
            String examCode, String candidateCode, String pin) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("examCode", examCode);
        payload.put("candidateCode", candidateCode);
        if (pin != null) {
            payload.put("accessPin", pin);
        }
        return mvc.perform(post("/api/public/join")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(payload)));
    }

    private JsonNode joined(String examCode, String candidateCode, String pin) throws Exception {
        String body = joinWithPin(examCode, candidateCode, pin)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private Map<String, Object> preflightPayload(boolean everythingOk, String photo) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("fullscreen", everythingOk);
        payload.put("connectionOk", everythingOk);
        payload.put("deviceOk", everythingOk);
        payload.put("micOk", everythingOk);
        payload.put("noiseOk", everythingOk);
        payload.put("cameraOk", everythingOk);
        payload.put("faceDetected", everythingOk);
        payload.put("gazeOnScreen", everythingOk);
        payload.put("noiseLevel", "-54 dBFS");
        payload.put("photoDataUrl", photo);
        payload.put("checks", Map.of("gazeMethod", "native", "ambientNoiseDb", -54));
        return payload;
    }

    private org.springframework.test.web.servlet.ResultActions saveAnswer(
            String token, long attemptId, long questionId, String text, long clientSeq) throws Exception {
        return mvc.perform(put("/api/attempts/" + attemptId + "/answers/" + questionId)
                .header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text", text, "clientSeq", clientSeq))));
    }

    @Test
    void newJoinsNeedTheIssuedPinAndARotationDoesNotStrandResumes() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        exam.setRequiresPin(true);
        examRepository.save(exam);

        joinWithPin(exam.getCode(), "P-001", null).andExpect(status().isConflict());

        JsonNode issued = issuePin(owner, exam);
        String pin = issued.get("pin").asText();
        assertThat(pin).matches("\\d{6}");
        assertThat(issued.get("requiresPin").asBoolean()).isTrue();
        assertThat(issued.get("mailConfigured").asBoolean()).isFalse();
        String detail = mvc.perform(get("/api/exams/" + exam.getId())
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(detail).get("pinConfigured").asBoolean()).isTrue();
        assertThat(issued.get("issuedAt").asText()).isNotBlank();

        joinWithPin(exam.getCode(), "P-001", "000000").andExpect(status().isForbidden());

        JsonNode first = joined(exam.getCode(), "P-001", pin);
        assertThat(first.get("attemptId").asLong()).isPositive();

        // Rotating the PIN must not lock answers away: resume goes by token, not by PIN.
        String rotated = issuePin(owner, exam).get("pin").asText();
        String resumed = mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "examCode", exam.getCode(),
                                "candidateCode", "P-001",
                                "resumeToken", first.get("sessionToken").asText()))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(resumed).get("attemptId").asLong())
                .isEqualTo(first.get("attemptId").asLong());

        if (!pin.equals(rotated)) {
            joinWithPin(exam.getCode(), "P-002", pin).andExpect(status().isForbidden());
        }
        joined(exam.getCode(), "P-002", rotated);

        Exam stored = examRepository.findById(exam.getId()).orElseThrow();
        assertThat(stored.isRequiresPin()).isTrue();
        assertThat(stored.getAccessPinHash()).isNotNull().isNotEqualTo(rotated);
    }

    @Test
    void repeatedWrongPinsAreThrottled() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        exam.setRequiresPin(true);
        examRepository.save(exam);
        String pin = issuePin(owner, exam).get("pin").asText();

        for (int attempt = 0; attempt < 5; attempt++) {
            joinWithPin(exam.getCode(), "T-00" + attempt, "999999").andExpect(status().isForbidden());
        }
        joinWithPin(exam.getCode(), "T-010", pin).andExpect(status().isTooManyRequests());
    }

    @Test
    void pinIssueIsOwnerOnlyAndReportsRosterRecipients() throws Exception {
        User owner = staff(Role.LECTURER);
        User outsider = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        exam.setRequiresPin(true);
        examRepository.save(exam);
        enroll(exam, "Ada@Example.edu");
        enroll(exam, "grace@example.edu");

        mvc.perform(post("/api/exams/" + exam.getId() + "/pin")
                        .header("Authorization", bearer(outsider)))
                .andExpect(status().isForbidden());

        JsonNode issued = issuePin(owner, exam);
        assertThat(issued.get("recipients").asInt()).isEqualTo(2);
        assertThat(issued.get("emailed").asInt()).isZero();
        assertThat(issued.get("failedRecipients")).isEmpty();
        assertThat(issued.get("sentAt").isNull()).isTrue();
        assertThat(issued.get("mailConfigured").asBoolean()).isFalse();
    }

    @Test
    void signedInStudentStillNeedsThePinForANewAttempt() throws Exception {
        User owner = staff(Role.LECTURER);
        User student = student();
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        exam.setRequiresPin(true);
        examRepository.save(exam);
        enroll(exam, student.getEmail());
        String pin = issuePin(owner, exam).get("pin").asText();

        String token = "Bearer " + jwtService.issueStudentToken(student);
        mvc.perform(post("/api/student/attempts/join")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("examCode", exam.getCode(), "candidateCode", "R-001"))))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/student/attempts/join")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "examCode", exam.getCode(),
                                "candidateCode", "R-001",
                                "accessPin", pin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attemptId").isNumber());
    }

    @Test
    void preflightChecklistGatesAnswersAndStartsTheClock() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        exam.setRequiresPreflight(true);
        examRepository.save(exam);

        JsonNode joined = joined(exam.getCode(), "F-001", null);
        long attemptId = joined.get("attemptId").asLong();
        long questionId = joined.get("answers").get(0).get("questionId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();

        assertThat(joined.get("requiresPreflight").asBoolean()).isTrue();
        assertThat(joined.get("activeStartedAt").isNull()).isTrue();
        assertThat(joined.get("preflightCompletedAt").isNull()).isTrue();

        saveAnswer(token, attemptId, questionId, "draft before the checks", 1)
                .andExpect(status().isConflict());
        mvc.perform(post("/api/attempts/" + attemptId + "/submit")
                        .header("Authorization", token))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/attempts/" + attemptId + "/preflight")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                preflightPayload(false, "data:image/jpeg;base64,AAAA"))))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/attempts/" + attemptId + "/preflight")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(preflightPayload(true, "https://evil.example/photo.jpg"))))
                .andExpect(status().isBadRequest());

        String photo = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
        String completed = mvc.perform(post("/api/attempts/" + attemptId + "/preflight")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(preflightPayload(true, photo))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deadlineAt").isNotEmpty())
                .andExpect(jsonPath("$.durationMinutes").value(60))
                .andReturn().getResponse().getContentAsString();
        JsonNode preflight = json.readTree(completed);
        Instant activeStartedAt = Instant.parse(preflight.get("activeStartedAt").asText());
        Instant expectedDeadline = activeStartedAt.plus(60, ChronoUnit.MINUTES);
        assertThat(Instant.parse(preflight.get("deadlineAt").asText())).isEqualTo(expectedDeadline);

        String again = mvc.perform(post("/api/attempts/" + attemptId + "/preflight")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(preflightPayload(true, photo))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(again).get("completedAt").asText())
                .isEqualTo(preflight.get("completedAt").asText());

        saveAnswer(token, attemptId, questionId, "First real answer", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revisionNo").value(1));

        mvc.perform(get("/api/exams/" + exam.getId() + "/attempts/" + attemptId + "/preflight")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photoDataUrl").value(photo))
                .andExpect(jsonPath("$.checks.gazeMethod").value("native"));
        mvc.perform(get("/api/exams/" + exam.getId() + "/attempts/" + attemptId + "/preflight"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deadlineStopsAnswersAndTheExpiryJobAutoSubmits() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);
        exam.setRequiresPreflight(true);
        examRepository.save(exam);

        JsonNode joined = joined(exam.getCode(), "E-001", null);
        long attemptId = joined.get("attemptId").asLong();
        long questionId = joined.get("answers").get(0).get("questionId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();
        String photo = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
        mvc.perform(post("/api/attempts/" + attemptId + "/preflight")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(preflightPayload(true, photo))))
                .andExpect(status().isOk());

        saveAnswer(token, attemptId, questionId, "Saved well before the deadline", 1)
                .andExpect(status().isOk());

        JsonNode secondJoin = joined(exam.getCode(), "E-002", null);
        long liveAttemptId = secondJoin.get("attemptId").asLong();
        String liveToken = "Bearer " + secondJoin.get("sessionToken").asText();
        mvc.perform(post("/api/attempts/" + liveAttemptId + "/preflight")
                        .header("Authorization", liveToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(preflightPayload(true, photo))))
                .andExpect(status().isOk());
        assertThat(expiryService.expire(liveAttemptId)).isFalse();

        Attempt attempt = attemptRepository.findById(attemptId).orElseThrow();
        Instant past = Instant.now().minus(61, ChronoUnit.MINUTES);
        attempt.setActiveStartedAt(past);
        attempt.setStartedAt(past);
        attemptRepository.save(attempt);

        saveAnswer(token, attemptId, questionId, "Typed after the deadline", 2)
                .andExpect(status().isConflict());

        assertThat(expiryService.expire(attemptId)).isTrue();
        assertThat(expiryService.expire(attemptId)).isFalse();

        Attempt expired = attemptRepository.findById(attemptId).orElseThrow();
        assertThat(expired.getStatus()).isEqualTo(AttemptStatus.SUBMITTED);
        assertThat(expired.isAutoSubmitted()).isTrue();
        assertThat(expired.getSubmittedAt()).isNotNull();
        assertThat(revisionRepository.countByAttemptId(attemptId)).isEqualTo(1);

        mvc.perform(get("/api/attempts/" + attemptId).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andExpect(jsonPath("$.autoSubmitted").value(true))
                .andExpect(jsonPath("$.answers[0].text").value("Saved well before the deadline"));
    }

    @Test
    void examWithoutPreflightStartsTheClockAtJoin() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        question(exam, 1);

        JsonNode joined = joined(exam.getCode(), "L-001", null);
        long attemptId = joined.get("attemptId").asLong();
        String token = "Bearer " + joined.get("sessionToken").asText();

        assertThat(joined.get("requiresPreflight").asBoolean()).isFalse();
        assertThat(joined.get("activeStartedAt").asText()).isEqualTo(joined.get("startedAt").asText());
        assertThat(joined.get("preflightCompletedAt").asText()).isNotBlank();

        saveAnswer(token, attemptId, joined.get("answers").get(0).get("questionId").asLong(),
                "No wizard needed", 1).andExpect(status().isOk());
    }
}
