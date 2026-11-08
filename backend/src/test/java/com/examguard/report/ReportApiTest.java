package com.examguard.report;

import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReportApiTest extends ApiTestBase {

    private record Fixture(Exam exam, Question question, Attempt attempt, String candidateCode) {
    }

    private Fixture gradedAttempt() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "RPT-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.CLOSED);

        Question question = question(exam, 1);
        question.setType(QuestionType.SINGLE_CHOICE);
        question.setPoints(new BigDecimal("5.00"));
        question.setGradingMode(GradingMode.AUTO);
        question.setContentJson("{\"options\":[{\"key\":\"A\",\"text\":\"UDP\"},"
                + "{\"key\":\"B\",\"text\":\"TCP\"}]}");
        question.setAnswerKeyJson("{\"selectedKeys\":[\"B\"]}");
        question.setExplanation("TCP is connection oriented.");
        question = questionRepository.save(question);

        String candidateCode = "RPT" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        Candidate candidate = candidate(exam, candidateCode);
        Attempt attempt = attempt(exam, candidate, AttemptStatus.SUBMITTED);

        AnswerRevision revision = revision(attempt, question, 1, "", Instant.now().minusSeconds(600));
        revision.setSelectedOptions("[\"B\"]");
        revisionRepository.save(revision);

        attempt.setScorePoints(new BigDecimal("5.00"));
        attempt.setMaxPoints(new BigDecimal("5.00"));
        attempt.setGradedAt(Instant.now());
        attempt = attemptRepository.save(attempt);
        return new Fixture(exam, question, attempt, candidateCode);
    }

    @Test
    void studentCannotReadReportBeforeRelease() throws Exception {
        Fixture fixture = gradedAttempt();
        String student = attemptToken(fixture);

        mvc.perform(get("/api/reports/attempts/" + fixture.attempt().getId()).header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Results have not been released yet"));

        mvc.perform(get("/api/reports/attempts/" + fixture.attempt().getId() + "/pdf")
                        .header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isForbidden());
    }

    @Test
    void releasedAttemptReportIncludesKeyAndExplanation() throws Exception {
        Fixture fixture = gradedAttempt();
        release(fixture);

        mvc.perform(get("/api/reports/attempts/" + fixture.attempt().getId())
                        .header(HttpHeaders.AUTHORIZATION, attemptToken(fixture)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.released").value(true))
                .andExpect(jsonPath("$.candidateCode").value(fixture.candidateCode()))
                .andExpect(jsonPath("$.scorePoints").value(5.00))
                .andExpect(jsonPath("$.questions[0].correctKeys[0]").value("B"))
                .andExpect(jsonPath("$.questions[0].explanation").value("TCP is connection oriented."));
    }

    @Test
    void examReportIsScopedToExamStaff() throws Exception {
        Fixture fixture = gradedAttempt();
        User owner = fixture.exam().getCreatedBy();

        mvc.perform(get("/api/reports/exams/" + fixture.exam().getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attempts").value(1));

        User outsider = staff(Role.LECTURER);
        mvc.perform(get("/api/reports/exams/" + fixture.exam().getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(outsider)))
                .andExpect(status().isForbidden());
    }

    @Test
    void attemptPdfIsRealPdfAndCarriesCandidateCode() throws Exception {
        Fixture fixture = gradedAttempt();
        release(fixture);

        MvcResult result = mvc.perform(get("/api/reports/attempts/" + fixture.attempt().getId() + "/pdf")
                        .header(HttpHeaders.AUTHORIZATION, attemptToken(fixture)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PDF_VALUE))
                .andReturn();

        byte[] pdf = result.getResponse().getContentAsByteArray();
        assertThat(new String(pdf, 0, 5, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");
        assertThat(pdf.length).isGreaterThan(1_000);
        try (PDDocument document = PDDocument.load(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertThat(text).contains(fixture.candidateCode());
            assertThat(text).contains(fixture.exam().getCode());
        }
    }

    @Test
    void examAndAdminPdfsRender() throws Exception {
        Fixture fixture = gradedAttempt();
        User admin = staff(Role.ADMIN);

        MvcResult examPdf = mvc.perform(get("/api/reports/exams/" + fixture.exam().getId() + "/pdf")
                        .header(HttpHeaders.AUTHORIZATION, bearer(fixture.exam().getCreatedBy())))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(magic(examPdf)).isEqualTo("%PDF-");

        MvcResult adminPdf = mvc.perform(get("/api/reports/admin/overview/pdf")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(magic(adminPdf)).isEqualTo("%PDF-");

        mvc.perform(get("/api/reports/exams/" + fixture.exam().getId() + "/csv")
                        .header(HttpHeaders.AUTHORIZATION, bearer(fixture.exam().getCreatedBy())))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "text/csv;charset=UTF-8"));
    }

    private void release(Fixture fixture) {
        Attempt stored = attemptRepository.findById(fixture.attempt().getId()).orElseThrow();
        stored.setReleasedAt(Instant.now());
        attemptRepository.save(stored);
    }

    private String attemptToken(Fixture fixture) {
        Attempt stub = new Attempt();
        stub.setId(fixture.attempt().getId());
        stub.setExam(fixture.exam());
        Candidate candidate = new Candidate();
        candidate.setCode(fixture.candidateCode());
        stub.setCandidate(candidate);
        return "Bearer " + jwtService.issueAttemptToken(stub);
    }

    private static String magic(MvcResult result) throws Exception {
        byte[] body = result.getResponse().getContentAsByteArray();
        assertThat(body.length).isGreaterThan(1_000);
        return new String(body, 0, 5, StandardCharsets.ISO_8859_1);
    }
}
