package com.examguard.service;

import com.examguard.attempt.AnswerJson;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamPermission;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.domain.User;
import com.examguard.exam.QuestionJson;
import com.examguard.exam.QuestionPayloads.AnswerKey;
import com.examguard.exam.QuestionPayloads.Content;
import com.examguard.exam.QuestionPayloads.Option;
import com.examguard.grading.GradingService;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.CandidateRepository;
import com.examguard.repo.ExamPermissionRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.QuestionRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Seeds a second demo exam that exercises every question type, auto-grading and the result-release
 * gate. Scores are scripted, not real assessment data.
 */
@Component
class DemoTypedExamSeeder {

    static final String EXAM_CODE = "DEMO-102";

    private final ExamRepository examRepository;
    private final ExamPermissionRepository permissionRepository;
    private final QuestionRepository questionRepository;
    private final CandidateRepository candidateRepository;
    private final AttemptRepository attemptRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final QuestionJson questionJson;
    private final AnswerJson answerJson;
    private final GradingService gradingService;
    private final PasswordEncoder passwordEncoder;

    DemoTypedExamSeeder(
            ExamRepository examRepository,
            ExamPermissionRepository permissionRepository,
            QuestionRepository questionRepository,
            CandidateRepository candidateRepository,
            AttemptRepository attemptRepository,
            AnswerRevisionRepository revisionRepository,
            QuestionJson questionJson,
            AnswerJson answerJson,
            GradingService gradingService,
            PasswordEncoder passwordEncoder) {
        this.examRepository = examRepository;
        this.permissionRepository = permissionRepository;
        this.questionRepository = questionRepository;
        this.candidateRepository = candidateRepository;
        this.attemptRepository = attemptRepository;
        this.revisionRepository = revisionRepository;
        this.questionJson = questionJson;
        this.answerJson = answerJson;
        this.gradingService = gradingService;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    SeededTypedExam seed(User lecturer, User reviewer) {
        Exam exam = new Exam();
        exam.setCode(EXAM_CODE);
        exam.setTitle("Demo Examination: Typed Questions and Grading");
        exam.setDescription("""
                A five-question demonstration with one question of each type. Choice and true/false
                answers are graded automatically; the short answer matches its accepted list; the essay
                waits for manual marking.""");
        exam.setDurationMinutes(45);
        exam.setStatus(ExamStatus.OPEN);
        exam.setAllowExtension(true);
        exam.setMaxStrikes(3);
        exam.setInstructions("""
                Leave the exam window at most three times. Every focus loss is recorded and your answers
                are saved when you return. The third focus loss ends the attempt.""");
        exam.setCreatedBy(lecturer);
        DemoAccess.protect(exam, passwordEncoder);
        exam = examRepository.save(exam);

        permissionRepository.save(permission(exam, lecturer, PermissionLevel.OWNER));
        permissionRepository.save(permission(exam, reviewer, PermissionLevel.REVIEWER));

        Question single = question(exam, 1, QuestionType.SINGLE_CHOICE, "2.00",
                "Which protocol provides reliable, ordered delivery?",
                new Content(List.of(
                        new Option("A", "UDP"),
                        new Option("B", "TCP"),
                        new Option("C", "ICMP"),
                        new Option("D", "ARP"))),
                new AnswerKey(List.of("B"), null, null, null),
                "TCP retransmits lost segments and reorders them before delivery.");

        Question multi = question(exam, 2, QuestionType.MULTI_CHOICE, "4.00",
                "Which of these are transport-layer protocols?",
                new Content(List.of(
                        new Option("A", "TCP"),
                        new Option("B", "IP"),
                        new Option("C", "UDP"),
                        new Option("D", "Ethernet"))),
                new AnswerKey(List.of("A", "C"), null, null, null),
                "TCP and UDP both run at the transport layer; IP and Ethernet do not.");

        Question trueFalse = question(exam, 3, QuestionType.TRUE_FALSE, "1.00",
                "A three-way handshake establishes a TCP connection.",
                new Content(List.of()),
                new AnswerKey(List.of("TRUE"), null, null, null),
                "SYN, SYN-ACK and ACK synchronise sequence numbers before data flows.");

        Question shortAnswer = question(exam, 4, QuestionType.SHORT_ANSWER, "3.00",
                "Which protocol translates domain names into IP addresses?",
                new Content(List.of()),
                new AnswerKey(null, List.of("DNS", "domain name system"), null, null),
                "DNS resolves names such as example.edu to addresses.");

        Question essay = question(exam, 5, QuestionType.ESSAY, "10.00",
                "Explain how TCP congestion control reacts to packet loss.",
                new Content(List.of()),
                new AnswerKey(null, null,
                        "Loss is treated as congestion: slow start, then congestion avoidance, then a "
                                + "reduction of the window on timeout or duplicate ACKs.",
                        "Full marks for naming slow start, congestion avoidance and window reduction."),
                "The window halves on loss under classic Tahoe/Reno behaviour.");

        Candidate strong = candidate(exam, "C101", "Strong candidate");
        Candidate partial = candidate(exam, "C102", "Partial candidate");

        Attempt released = submit(exam, strong, single, multi, trueFalse, shortAnswer, essay,
                List.of("B"), List.of("A", "C"), List.of("TRUE"), "dns",
                "Loss makes the sender halve its congestion window, then grow it again linearly.");
        released.setReleasedAt(Instant.now().minus(10, ChronoUnit.MINUTES));
        attemptRepository.save(released);
        gradingService.autoGrade(released);

        Attempt awaiting = submit(exam, partial, single, multi, trueFalse, shortAnswer, essay,
                List.of("A"), List.of("A"), List.of("FALSE"), "arp",
                "The window is reset when a packet is lost and the transfer restarts.");
        gradingService.autoGrade(awaiting);

        return new SeededTypedExam(exam, List.of(single, multi, trueFalse, shortAnswer, essay),
                released, awaiting);
    }

    @Transactional
    void attachStudent(Attempt attempt, User student) {
        attempt.setStudentUser(student);
        attemptRepository.save(attempt);
    }

    private Question question(Exam exam, int order, QuestionType type, String points, String prompt,
                              Content content, AnswerKey key, String explanation) {
        Question question = new Question();
        question.setExam(exam);
        question.setOrderIndex(order);
        question.setPrompt(prompt);
        question.setMaxWords(type == QuestionType.ESSAY ? 400 : 120);
        question.setType(type);
        question.setPoints(new BigDecimal(points));
        question.setGradingMode(type == QuestionType.SHORT_ANSWER || type == QuestionType.ESSAY
                ? GradingMode.MANUAL
                : GradingMode.AUTO);
        question.setContentJson(questionJson.write(content));
        question.setAnswerKeyJson(questionJson.write(key));
        question.setExplanation(explanation);
        return questionRepository.save(question);
    }

    private Attempt submit(Exam exam, Candidate candidate, Question single, Question multi,
                           Question trueFalse, Question shortAnswer, Question essay,
                           List<String> singleAnswer, List<String> multiAnswer,
                           List<String> trueFalseAnswer, String shortText, String essayText) {
        Instant start = Instant.now().minus(50, ChronoUnit.MINUTES);
        Attempt attempt = new Attempt();
        attempt.setExam(exam);
        attempt.setCandidate(candidate);
        attempt.setStatus(AttemptStatus.SUBMITTED);
        attempt.setStartedAt(start);
        attempt.setSubmittedAt(start.plus(35, ChronoUnit.MINUTES));
        attempt.setLastSeenAt(start.plus(35, ChronoUnit.MINUTES));
        attempt = attemptRepository.save(attempt);

        saveAnswer(attempt, single, "", singleAnswer, 1);
        saveAnswer(attempt, multi, "", multiAnswer, 2);
        saveAnswer(attempt, trueFalse, "", trueFalseAnswer, 3);
        saveAnswer(attempt, shortAnswer, shortText, List.of(), 4);
        saveAnswer(attempt, essay, essayText, List.of(), 5);
        return attempt;
    }

    private void saveAnswer(Attempt attempt, Question question, String text, List<String> selected, int revisionNo) {
        AnswerRevision revision = new AnswerRevision();
        revision.setAttempt(attempt);
        revision.setQuestion(question);
        revision.setRevisionNo(revisionNo);
        revision.setText(text);
        revision.setSelectedOptions(answerJson.write(selected));
        revision.setClientSeq((long) revisionNo);
        revision.setSavedAt(attempt.getStartedAt().plus(revisionNo * 5L, ChronoUnit.MINUTES));
        revisionRepository.save(revision);
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

    record SeededTypedExam(Exam exam, List<Question> questions, Attempt released, Attempt awaiting) {
    }
}
