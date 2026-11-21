package com.examguard.judge;

import com.examguard.domain.AnswerGrade;
import com.examguard.domain.Attempt;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.judge.CodeRunnerDtos.RunnerResponse;
import com.examguard.judge.CodeRunnerDtos.RunnerTestResult;
import com.examguard.repo.AnswerGradeRepository;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CodeJudgingApiTest extends ApiTestBase {

    private static final String SOURCE = "def solve(a, b):\n    return a + b\n";

    @MockitoBean
    private CodeRunnerClient runnerClient;

    @Autowired
    private AnswerGradeRepository gradeRepository;

    private record Joined(long attemptId, String token) {
    }

    @Test
    void creatingACodingQuestionWithTestsDefaultsToAutomaticGrading() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode("CODE"), ExamStatus.OPEN);

        mvc.perform(post("/api/exams/" + exam.getId() + "/questions")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(codeQuestion(twoTests(), null))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("CODE"))
                .andExpect(jsonPath("$.gradingMode").value("AUTO"))
                .andExpect(jsonPath("$.content.language").value("PYTHON"))
                .andExpect(jsonPath("$.content.starterCode").value("def solve(a, b):"))
                .andExpect(jsonPath("$.answerKey.tests[0].name").value("basic"))
                .andExpect(jsonPath("$.answerKey.tests[0].expectedOutput").value("3\n"))
                .andExpect(jsonPath("$.answerKey.tests[1].hidden").value(true));
    }

    @Test
    @SuppressWarnings("unchecked")
    void automaticGradingWithoutTestsIsRejected() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode("CODE"), ExamStatus.OPEN);
        Map<String, Object> payload = codeQuestion(List.of(), "AUTO");
        ((Map<String, Object>) payload.get("answerKey")).put("modelAnswer", "print(a + b)");

        mvc.perform(post("/api/exams/" + exam.getId() + "/questions")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Automatic grading needs at least one test case"));
    }

    @Test
    void candidateViewCarriesTheLanguageAndStarterButNeverTheTests() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode("CODE"), ExamStatus.OPEN);
        createQuestion(owner, exam, codeQuestion(twoTests(), null));

        Joined joined = join(exam, "C1");
        String state = mvc.perform(get("/api/attempts/" + joined.attemptId())
                        .header("Authorization", "Bearer " + joined.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exam.questions[0].type").value("CODE"))
                .andExpect(jsonPath("$.exam.questions[0].content.language").value("PYTHON"))
                .andExpect(jsonPath("$.exam.questions[0].content.starterCode").value("def solve(a, b):"))
                .andReturn().getResponse().getContentAsString();

        assertThat(state)
                .doesNotContain("tests")
                .doesNotContain("expectedOutput")
                .doesNotContain("answerKey")
                .doesNotContain("gradingMode");
    }

    @Test
    void savingCodeKeepsIndentationAndLineBreaks() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode("CODE"), ExamStatus.OPEN);
        long questionId = createQuestion(owner, exam, codeQuestion(twoTests(), null));
        Joined joined = join(exam, "C1");

        save(joined, questionId, "def solve(a, b):\r\n\tvalue  =  a + b\r\n\treturn value\r\n");

        String stored = revisionRepository
                .findFirstByAttemptIdAndQuestionIdOrderByRevisionNoDesc(joined.attemptId(), questionId)
                .orElseThrow()
                .getText();
        assertThat(stored).isEqualTo("def solve(a, b):\n\tvalue  =  a + b\n\treturn value\n");
    }

    @Test
    void submissionScoresPartialCreditFromTheTestResults() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode("CODE"), ExamStatus.OPEN);
        long questionId = createQuestion(owner, exam, codeQuestion(twoTests(), null));
        Joined joined = join(exam, "C1");
        save(joined, questionId, SOURCE);

        when(runnerClient.run(any())).thenReturn(new RunnerResponse(null, List.of(
                new RunnerTestResult(0, true, "PASSED", 12, null),
                new RunnerTestResult(1, false, "FAILED", 9, "expected 0"))));

        submit(joined);

        Attempt attempt = attemptRepository.findById(joined.attemptId()).orElseThrow();
        assertThat(attempt.getScorePoints()).isEqualByComparingTo(new BigDecimal("5.00"));
        assertThat(attempt.getMaxPoints()).isEqualByComparingTo(new BigDecimal("10.00"));

        JsonNode row = gradingRow(owner, exam, joined.attemptId(), questionId);
        assertThat(row.get("awardedPoints").decimalValue()).isEqualByComparingTo("5.00");
        assertThat(row.get("comment").asText()).isEqualTo("Auto-judged: 1 of 2 test cases passed.");
        JsonNode detail = row.get("detail");
        assertThat(detail.get("language").asText()).isEqualTo("PYTHON");
        assertThat(detail.get("passed").asInt()).isEqualTo(1);
        assertThat(detail.get("total").asInt()).isEqualTo(2);
        assertThat(detail.get("tests").get(0).get("name").asText()).isEqualTo("basic");
        assertThat(detail.get("tests").get(1).get("status").asText()).isEqualTo("FAILED");
        assertThat(detail.get("tests").get(1).get("hidden").asBoolean()).isTrue();
    }

    @Test
    void aRunnerOutageLeavesTheAnswerUngradedAndARerunFillsIt() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode("CODE"), ExamStatus.OPEN);
        long questionId = createQuestion(owner, exam, codeQuestion(twoTests(), null));
        Joined joined = join(exam, "C1");
        save(joined, questionId, SOURCE);

        doThrow(new IllegalStateException("connect timed out")).when(runnerClient).run(any());
        submit(joined);

        JsonNode before = gradingRow(owner, exam, joined.attemptId(), questionId);
        assertThat(before.get("awardedPoints").isNull()).isTrue();
        assertThat(before.get("detail").isNull()).isTrue();
        assertThat(gradeRepository.findByAttemptIdAndQuestionId(joined.attemptId(), questionId)).isEmpty();

        doReturn(new RunnerResponse(null, List.of(
                new RunnerTestResult(0, true, "PASSED", 11, null),
                new RunnerTestResult(1, true, "PASSED", 7, null)))).when(runnerClient).run(any());
        mvc.perform(post("/api/exams/" + exam.getId() + "/code-judge")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attemptsJudged").value(1))
                .andExpect(jsonPath("$.questionsJudged").value(1));

        JsonNode after = gradingRow(owner, exam, joined.attemptId(), questionId);
        assertThat(after.get("awardedPoints").decimalValue()).isEqualByComparingTo("10.00");
        assertThat(after.get("detail").get("passed").asInt()).isEqualTo(2);
    }

    @Test
    void rerunningJudgingNeverOverwritesAHandMarkedScore() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode("CODE"), ExamStatus.OPEN);
        long questionId = createQuestion(owner, exam, codeQuestion(twoTests(), null));
        Joined joined = join(exam, "C1");
        save(joined, questionId, SOURCE);
        when(runnerClient.run(any())).thenReturn(new RunnerResponse(null, List.of(
                new RunnerTestResult(0, true, "PASSED", 5, null),
                new RunnerTestResult(1, true, "PASSED", 5, null))));
        submit(joined);

        mvc.perform(put("/api/attempts/" + joined.attemptId() + "/answers/" + questionId + "/grade")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "awardedPoints", new BigDecimal("3.00"),
                                "comment", "Part marks for the approach"))))
                .andExpect(status().isOk());

        mvc.perform(post("/api/exams/" + exam.getId() + "/code-judge")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attemptsJudged").value(0))
                .andExpect(jsonPath("$.questionsJudged").value(0));

        AnswerGrade grade = gradeRepository
                .findByAttemptIdAndQuestionId(joined.attemptId(), questionId)
                .orElseThrow();
        assertThat(grade.getAwardedPoints()).isEqualByComparingTo("3.00");
        assertThat(grade.getMode()).isEqualTo(GradingMode.MANUAL);
        assertThat(grade.getComment()).isEqualTo("Part marks for the approach");
    }

    private String uniqueCode(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    private List<Map<String, Object>> twoTests() {
        return List.of(
                Map.of("name", "basic", "input", "1 2\n", "expectedOutput", "3\n"),
                Map.of("name", "edge", "input", "-1 1\n", "expectedOutput", "0\n", "hidden", true));
    }

    private Map<String, Object> codeQuestion(List<Map<String, Object>> tests, String gradingMode) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("language", "PYTHON");
        content.put("starterCode", "def solve(a, b):\n");
        Map<String, Object> answerKey = new LinkedHashMap<>();
        answerKey.put("tests", tests);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prompt", "Read two integers and print their sum");
        payload.put("type", "CODE");
        payload.put("points", 10);
        payload.put("content", content);
        payload.put("answerKey", answerKey);
        if (gradingMode != null) {
            payload.put("gradingMode", gradingMode);
        }
        return payload;
    }

    private long createQuestion(User owner, Exam exam, Map<String, Object> payload) throws Exception {
        String body = mvc.perform(post("/api/exams/" + exam.getId() + "/questions")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(payload)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("id").asLong();
    }

    private Joined join(Exam exam, String candidateCode) throws Exception {
        String body = mvc.perform(post("/api/public/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "examCode", exam.getCode(), "candidateCode", candidateCode))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode joined = json.readTree(body);
        return new Joined(joined.get("attemptId").asLong(), joined.get("sessionToken").asText());
    }

    private void save(Joined joined, long questionId, String text) throws Exception {
        mvc.perform(put("/api/attempts/" + joined.attemptId() + "/answers/" + questionId)
                        .header("Authorization", "Bearer " + joined.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", text, "clientSeq", 1))))
                .andExpect(status().isOk());
    }

    private void submit(Joined joined) throws Exception {
        mvc.perform(post("/api/attempts/" + joined.attemptId() + "/submit")
                        .header("Authorization", "Bearer " + joined.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());
    }

    private JsonNode gradingRow(User owner, Exam exam, long attemptId, long questionId) throws Exception {
        String body = mvc.perform(get("/api/exams/" + exam.getId() + "/grading")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        for (JsonNode row : json.readTree(body)) {
            if (row.get("attemptId").asLong() == attemptId && row.get("questionId").asLong() == questionId) {
                return row;
            }
        }
        throw new AssertionError("Grading row missing for attempt " + attemptId + " question " + questionId);
    }
}
