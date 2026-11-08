package com.examguard.service;

import com.examguard.attempt.AnswerJson;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.CodeLanguage;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamEnrollment;
import com.examguard.domain.ExamPermission;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.domain.User;
import com.examguard.exam.QuestionJson;
import com.examguard.exam.QuestionPayloads.AnswerKey;
import com.examguard.exam.QuestionPayloads.CodeTest;
import com.examguard.exam.QuestionPayloads.Content;
import com.examguard.judge.CodeJudgeService;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.CandidateRepository;
import com.examguard.repo.ExamEnrollmentRepository;
import com.examguard.repo.ExamPermissionRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.QuestionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Seeds a coding demo exam. Answers are scripted and judged by the sandbox when it is reachable;
 * if the runner is down the attempt stays ungraded so staff can re-run judging later.
 */
@Component
class DemoCodeExamSeeder {

    private static final Logger log = LoggerFactory.getLogger(DemoCodeExamSeeder.class);

    static final String EXAM_CODE = "DEMO-103";
    static final String ENROLLED_EMAIL = "student@examguard.local";

    private final ExamRepository examRepository;
    private final ExamPermissionRepository permissionRepository;
    private final ExamEnrollmentRepository enrollmentRepository;
    private final QuestionRepository questionRepository;
    private final CandidateRepository candidateRepository;
    private final AttemptRepository attemptRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final QuestionJson questionJson;
    private final AnswerJson answerJson;
    private final CodeJudgeService codeJudgeService;

    DemoCodeExamSeeder(
            ExamRepository examRepository,
            ExamPermissionRepository permissionRepository,
            ExamEnrollmentRepository enrollmentRepository,
            QuestionRepository questionRepository,
            CandidateRepository candidateRepository,
            AttemptRepository attemptRepository,
            AnswerRevisionRepository revisionRepository,
            QuestionJson questionJson,
            AnswerJson answerJson,
            CodeJudgeService codeJudgeService) {
        this.examRepository = examRepository;
        this.permissionRepository = permissionRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.questionRepository = questionRepository;
        this.candidateRepository = candidateRepository;
        this.attemptRepository = attemptRepository;
        this.revisionRepository = revisionRepository;
        this.questionJson = questionJson;
        this.answerJson = answerJson;
        this.codeJudgeService = codeJudgeService;
    }

    @Transactional
    SeededCodeExam seed(User lecturer, User reviewer) {
        Instant now = Instant.now();
        Exam exam = new Exam();
        exam.setCode(EXAM_CODE);
        exam.setTitle("Demo Examination: Coding (DSA)");
        exam.setDescription("""
                Three short coding tasks marked by hidden tests. Partial credit is awarded per passing
                test case, and the same correct solution is expected from every candidate, so code
                answers are never compared between candidates.""");
        exam.setDurationMinutes(60);
        exam.setStatus(ExamStatus.OPEN);
        exam.setAllowExtension(true);
        exam.setMaxStrikes(3);
        exam.setOpensAt(now.minus(1, ChronoUnit.HOURS));
        exam.setClosesAt(now.plus(7, ChronoUnit.DAYS));
        exam.setInstructions("""
                Write your solution in the editor and submit when you are ready. Your code runs against
                hidden tests; there is no partial-credit penalty for trying. Leaving the exam window is
                still recorded.""");
        exam.setCreatedBy(lecturer);
        exam = examRepository.save(exam);

        permissionRepository.save(permission(exam, lecturer, PermissionLevel.OWNER));
        permissionRepository.save(permission(exam, reviewer, PermissionLevel.REVIEWER));
        enroll(exam, ENROLLED_EMAIL);

        Question sum = question(exam, 1, CodeLanguage.PYTHON, "10.00",
                "Read two integers separated by a space and print their sum.",
                new Content(null, CodeLanguage.PYTHON,
                        "a, b = map(int, input().split())\n# print the sum below\n"),
                new AnswerKey(null, null,
                        "a, b = map(int, input().split())\nprint(a + b)",
                        null,
                        List.of(
                                test("Small numbers", "1 2", "3", false),
                                test("Negative numbers", "10 -4", "6", false),
                                test("Large numbers", "1000 2000", "3000", true))),
                "Reading both integers and printing their sum is enough; no extra text may be printed.");

        Question reverse = question(exam, 2, CodeLanguage.JAVA, "10.00",
                "Read one line of text and print it reversed.",
                new Content(null, CodeLanguage.JAVA, """
                        import java.util.Scanner;

                        public class Main {
                            public static void main(String[] args) {
                                Scanner scanner = new Scanner(System.in);
                                // print the reversed line
                            }
                        }
                        """),
                new AnswerKey(null, null, """
                        import java.util.Scanner;

                        public class Main {
                            public static void main(String[] args) {
                                Scanner scanner = new Scanner(System.in);
                                String line = scanner.hasNextLine() ? scanner.nextLine() : "";
                                System.out.println(new StringBuilder(line).reverse());
                            }
                        }
                        """, null,
                        List.of(
                                test("Word", "abc", "cba", false),
                                test("Palindrome", "racecar", "racecar", false),
                                test("Hidden phrase", "exam guard", "draug maxe", true))),
                "The class must stay named Main; the judge compiles Main.java before running the tests.");

        Question maximum = question(exam, 3, CodeLanguage.JAVASCRIPT, "10.00",
                "Read integers until the input ends and print the largest one.",
                new Content(null, CodeLanguage.JAVASCRIPT, """
                        const chunks = [];
                        process.stdin.on('data', (chunk) => chunks.push(chunk));
                        process.stdin.on('end', () => {
                          const numbers = Buffer.concat(chunks).toString().trim().split(/\\s+/).map(Number);
                          // print the largest number
                        });
                        """),
                new AnswerKey(null, null, """
                        const chunks = [];
                        process.stdin.on('data', (chunk) => chunks.push(chunk));
                        process.stdin.on('end', () => {
                          const numbers = Buffer.concat(chunks).toString().trim().split(/\\s+/).map(Number);
                          console.log(Math.max(...numbers));
                        });
                        """, null,
                        List.of(
                                test("Rising", "1 5 3", "5", false),
                                test("Single value", "7", "7", false),
                                test("Hidden negatives", "-1 -9 -3", "-1", true))),
                "The input can be empty only for the hidden case; guard against NaN if you prefer.");

        Candidate complete = candidate(exam, "C201", "Complete submission");
        Candidate partial = candidate(exam, "C202", "Partial submission");

        Attempt released = submit(exam, complete,
                "a, b = map(int, input().split())\nprint(a + b)",
                """
                        import java.util.Scanner;

                        public class Main {
                            public static void main(String[] args) {
                                Scanner scanner = new Scanner(System.in);
                                String line = scanner.hasNextLine() ? scanner.nextLine() : "";
                                System.out.println(new StringBuilder(line).reverse());
                            }
                        }
                        """,
                """
                        const chunks = [];
                        process.stdin.on('data', (chunk) => chunks.push(chunk));
                        process.stdin.on('end', () => {
                          const numbers = Buffer.concat(chunks).toString().trim().split(/\\s+/).map(Number);
                          console.log(Math.min(...numbers));
                        });
                        """,
                sum, reverse, maximum);
        released.setReleasedAt(Instant.now().minus(5, ChronoUnit.MINUTES));
        released = attemptRepository.save(released);

        Attempt awaiting = submit(exam, partial,
                "a, b = map(int, input().split())\nprint(a + b)",
                "",
                "",
                sum, reverse, maximum);
        awaiting = attemptRepository.save(awaiting);

        judgeQuietly(released);
        judgeQuietly(awaiting);

        return new SeededCodeExam(exam, released, awaiting);
    }

    private void judgeQuietly(Attempt attempt) {
        try {
            codeJudgeService.judgeAttempt(attempt.getId());
        } catch (RuntimeException ex) {
            log.warn("Demo code judging skipped for attempt {}: {}", attempt.getId(), ex.getMessage());
        }
    }

    private CodeTest test(String name, String input, String expectedOutput, boolean hidden) {
        return new CodeTest(name, input, expectedOutput, hidden);
    }

    private Question question(Exam exam, int order, CodeLanguage language, String points, String prompt,
                              Content content, AnswerKey key, String explanation) {
        Question question = new Question();
        question.setExam(exam);
        question.setOrderIndex(order);
        question.setPrompt(prompt);
        question.setMaxWords(0);
        question.setType(QuestionType.CODE);
        question.setPoints(new BigDecimal(points));
        question.setGradingMode(GradingMode.AUTO);
        question.setContentJson(questionJson.write(content));
        question.setAnswerKeyJson(questionJson.write(key));
        question.setExplanation(explanation);
        return questionRepository.save(question);
    }

    private Attempt submit(Exam exam, Candidate candidate, String sumAnswer, String reverseAnswer,
                           String maximumAnswer, Question sum, Question reverse, Question maximum) {
        Instant start = Instant.now().minus(40, ChronoUnit.MINUTES);
        Attempt attempt = new Attempt();
        attempt.setExam(exam);
        attempt.setCandidate(candidate);
        attempt.setStatus(AttemptStatus.SUBMITTED);
        attempt.setStartedAt(start);
        attempt.setSubmittedAt(start.plus(25, ChronoUnit.MINUTES));
        attempt.setLastSeenAt(start.plus(25, ChronoUnit.MINUTES));
        attempt = attemptRepository.save(attempt);

        saveAnswer(attempt, sum, sumAnswer, 1);
        saveAnswer(attempt, reverse, reverseAnswer, 2);
        saveAnswer(attempt, maximum, maximumAnswer, 3);
        return attempt;
    }

    private void saveAnswer(Attempt attempt, Question question, String text, int revisionNo) {
        AnswerRevision revision = new AnswerRevision();
        revision.setAttempt(attempt);
        revision.setQuestion(question);
        revision.setRevisionNo(revisionNo);
        revision.setText(text);
        revision.setSelectedOptions(answerJson.write(List.of()));
        revision.setClientSeq((long) revisionNo);
        revision.setSavedAt(attempt.getStartedAt().plus(revisionNo * 5L, ChronoUnit.MINUTES));
        revisionRepository.save(revision);
    }

    private void enroll(Exam exam, String email) {
        if (enrollmentRepository.existsByExamIdAndEmailIgnoreCase(exam.getId(), email)) {
            return;
        }
        ExamEnrollment enrollment = new ExamEnrollment();
        enrollment.setExam(exam);
        enrollment.setEmail(email);
        enrollmentRepository.save(enrollment);
    }

    private ExamPermission permission(Exam exam, User user, PermissionLevel level) {
        ExamPermission permission = new ExamPermission();
        permission.setExam(exam);
        permission.setUser(user);
        permission.setLevel(level);
        return permission;
    }

    private Candidate candidate(Exam exam, String code, String label) {
        Candidate candidate = new Candidate();
        candidate.setExam(exam);
        candidate.setCode(code);
        candidate.setDisplayLabel(label);
        return candidateRepository.save(candidate);
    }

    record SeededCodeExam(Exam exam, Attempt released, Attempt awaiting) {
    }
}
