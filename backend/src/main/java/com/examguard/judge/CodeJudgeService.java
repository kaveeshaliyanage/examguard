package com.examguard.judge;

import com.examguard.domain.AnswerGrade;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.exam.QuestionJson;
import com.examguard.exam.QuestionPayloads.AnswerKey;
import com.examguard.exam.QuestionPayloads.CodeTest;
import com.examguard.grading.GradingService;
import com.examguard.judge.CodeRunnerDtos.CodeGradeDetail;
import com.examguard.judge.CodeRunnerDtos.CodeJudgeSummary;
import com.examguard.judge.CodeRunnerDtos.CodeTestResult;
import com.examguard.judge.CodeRunnerDtos.RunnerRequest;
import com.examguard.judge.CodeRunnerDtos.RunnerResponse;
import com.examguard.judge.CodeRunnerDtos.RunnerTest;
import com.examguard.judge.CodeRunnerDtos.RunnerTestResult;
import com.examguard.repo.AnswerGradeRepository;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.service.AccessService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class CodeJudgeService {

    private static final Logger log = LoggerFactory.getLogger(CodeJudgeService.class);
    private static final int TIME_LIMIT_MS = 2000;

    private final CodeRunnerClient runnerClient;
    private final AttemptRepository attemptRepository;
    private final QuestionRepository questionRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final AnswerGradeRepository gradeRepository;
    private final QuestionJson questionJson;
    private final AccessService accessService;
    private final GradingService gradingService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    public CodeJudgeService(
            CodeRunnerClient runnerClient,
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository,
            AnswerRevisionRepository revisionRepository,
            AnswerGradeRepository gradeRepository,
            QuestionJson questionJson,
            AccessService accessService,
            GradingService gradingService,
            ObjectMapper objectMapper,
            TransactionTemplate transactionTemplate) {
        this.runnerClient = runnerClient;
        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
        this.revisionRepository = revisionRepository;
        this.gradeRepository = gradeRepository;
        this.questionJson = questionJson;
        this.accessService = accessService;
        this.gradingService = gradingService;
        this.objectMapper = objectMapper;
        this.transactionTemplate = transactionTemplate;
    }

    @Transactional
    public int judgeAttempt(Long attemptId) {
        Attempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attempt not found"));
        if (attempt.getStatus() == AttemptStatus.IN_PROGRESS) {
            return 0;
        }
        return judge(attempt);
    }

    /**
     * Re-runs judging for an exam. Each attempt gets its own transaction so a slow sandbox never
     * holds one database transaction open across the whole cohort.
     */
    public CodeJudgeSummary judgeExam(Authentication auth, Long examId) {
        accessService.requireExamOwner(auth, examId);
        List<Long> attemptIds = attemptRepository.findByExamIdOrderByStartedAtAsc(examId).stream()
                .filter(attempt -> attempt.getStatus() != AttemptStatus.IN_PROGRESS)
                .map(Attempt::getId)
                .toList();
        int attempts = 0;
        int questions = 0;
        for (Long attemptId : attemptIds) {
            Integer judged = transactionTemplate.execute(status -> judgeAttempt(attemptId));
            if (judged != null && judged > 0) {
                attempts++;
                questions += judged;
            }
        }
        return new CodeJudgeSummary(attempts, questions);
    }

    private int judge(Attempt attempt) {
        List<Question> codeQuestions = questionRepository
                .findByExamIdOrderByOrderIndexAsc(attempt.getExam().getId()).stream()
                .filter(question -> question.getType() == QuestionType.CODE)
                .filter(question -> question.getGradingMode() != GradingMode.MANUAL)
                .toList();
        if (codeQuestions.isEmpty()) {
            return 0;
        }

        Map<Long, AnswerGrade> existing = new HashMap<>();
        for (AnswerGrade grade : gradeRepository.findByAttemptId(attempt.getId())) {
            existing.put(grade.getQuestion().getId(), grade);
        }

        int judged = 0;
        for (Question question : codeQuestions) {
            AnswerKey key = questionJson.answerKey(question);
            List<CodeTest> tests = key == null || key.tests() == null ? List.of() : key.tests();
            if (tests.isEmpty()) {
                continue;
            }
            AnswerGrade grade = existing.get(question.getId());
            if (grade != null && grade.getMode() == GradingMode.MANUAL) {
                continue;
            }
            String source = revisionRepository
                    .findFirstByAttemptIdAndQuestionIdOrderByRevisionNoDesc(attempt.getId(), question.getId())
                    .map(AnswerRevision::getText)
                    .orElse("");
            if (source.isBlank()) {
                continue;
            }

            RunnerResponse outcome;
            try {
                outcome = runnerClient.run(new RunnerRequest(
                        questionLanguage(question),
                        source,
                        tests.stream().map(test -> new RunnerTest(test.input(), test.expectedOutput())).toList(),
                        TIME_LIMIT_MS));
            } catch (RuntimeException ex) {
                // The judge is infrastructure, not evidence: never award zero because it is down.
                log.warn("Code judge unavailable for attempt {} question {}: {}",
                        attempt.getId(), question.getId(), ex.getMessage());
                continue;
            }
            if (outcome == null) {
                continue;
            }

            List<RunnerTestResult> results = outcome.tests() == null ? List.of() : outcome.tests();
            int passed = (int) results.stream().filter(RunnerTestResult::passed).count();
            int total = tests.size();
            BigDecimal awarded = question.getPoints() == null
                    ? BigDecimal.ZERO
                    : question.getPoints()
                            .multiply(BigDecimal.valueOf(passed))
                            .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);

            if (grade == null) {
                grade = new AnswerGrade();
                grade.setAttempt(attempt);
                grade.setQuestion(question);
            }
            grade.setAwardedPoints(awarded);
            grade.setMaxPoints(question.getPoints());
            grade.setMode(GradingMode.AUTO);
            grade.setGradedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
            if (grade.getComment() == null) {
                grade.setComment(outcome.compileError() != null
                        ? "Auto-judged: the code did not compile."
                        : "Auto-judged: " + passed + " of " + total + " test cases passed.");
            }
            grade.setDetailJson(writeDetail(question, tests, results, outcome.compileError(), passed, total));
            gradeRepository.save(grade);
            judged++;
        }

        if (judged > 0) {
            gradingService.recomputeTotals(attempt);
        }
        return judged;
    }

    private String writeDetail(Question question, List<CodeTest> tests, List<RunnerTestResult> results,
                               String compileError, int passed, int total) {
        List<CodeTestResult> rows = new ArrayList<>();
        for (int index = 0; index < tests.size(); index++) {
            CodeTest test = tests.get(index);
            RunnerTestResult result = index < results.size() ? results.get(index) : null;
            String status = result == null
                    ? (compileError == null ? "NOT_RUN" : "COMPILE_ERROR")
                    : result.status();
            rows.add(new CodeTestResult(
                    test.name(),
                    result != null && result.passed(),
                    status,
                    Boolean.TRUE.equals(test.hidden()),
                    result == null ? 0 : result.durationMs()));
        }
        CodeGradeDetail detail = new CodeGradeDetail(questionLanguage(question), passed, total, rows);
        try {
            return objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }

    private String questionLanguage(Question question) {
        var language = questionJson.content(question).get("language");
        return language == null ? "PYTHON" : language.asText();
    }
}
