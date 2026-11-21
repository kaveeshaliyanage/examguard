package com.examguard.report;

import com.examguard.domain.AnswerGrade;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Exam;
import com.examguard.domain.Finding;
import com.examguard.domain.IntegrityEvent;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.exam.QuestionJson;
import com.examguard.exam.QuestionPayloads.AnswerKey;
import com.examguard.judge.CodeGradeDetails;
import com.examguard.judge.CodeRunnerDtos.CodeGradeDetail;
import com.examguard.repo.AnswerGradeRepository;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.FindingRepository;
import com.examguard.repo.IntegrityEventRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.repo.UserRepository;
import com.examguard.report.ReportDtos.AdminExamRow;
import com.examguard.report.ReportDtos.AdminOverview;
import com.examguard.report.ReportDtos.AttemptReport;
import com.examguard.report.ReportDtos.BandBucket;
import com.examguard.report.ReportDtos.ExamIntegrity;
import com.examguard.report.ReportDtos.ExamReport;
import com.examguard.report.ReportDtos.FlaggedCandidate;
import com.examguard.report.ReportDtos.IntegrityReport;
import com.examguard.report.ReportDtos.IntegritySignal;
import com.examguard.report.ReportDtos.QuestionPerformance;
import com.examguard.report.ReportDtos.QuestionReport;
import com.examguard.report.ReportDtos.ReviewSignal;
import com.examguard.service.AccessService;
import com.examguard.service.AnalysisClient;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ReportService {

    private static final int REVIEW_SIGNAL_LIMIT = 10;
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'")
            .withZone(java.time.ZoneOffset.UTC);

    private final ExamRepository examRepository;
    private final QuestionRepository questionRepository;
    private final AttemptRepository attemptRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final AnswerGradeRepository gradeRepository;
    private final IntegrityEventRepository integrityRepository;
    private final FindingRepository findingRepository;
    private final UserRepository userRepository;
    private final QuestionJson questionJson;
    private final CodeGradeDetails codeGradeDetails;
    private final AccessService accessService;
    private final AnalysisClient analysisClient;
    private final PdfRenderer pdfRenderer;
    private final ObjectMapper objectMapper;

    public ReportService(
            ExamRepository examRepository,
            QuestionRepository questionRepository,
            AttemptRepository attemptRepository,
            AnswerRevisionRepository revisionRepository,
            AnswerGradeRepository gradeRepository,
            IntegrityEventRepository integrityRepository,
            FindingRepository findingRepository,
            UserRepository userRepository,
            QuestionJson questionJson,
            CodeGradeDetails codeGradeDetails,
            AccessService accessService,
            AnalysisClient analysisClient,
            PdfRenderer pdfRenderer,
            ObjectMapper objectMapper) {
        this.examRepository = examRepository;
        this.questionRepository = questionRepository;
        this.attemptRepository = attemptRepository;
        this.revisionRepository = revisionRepository;
        this.gradeRepository = gradeRepository;
        this.integrityRepository = integrityRepository;
        this.findingRepository = findingRepository;
        this.userRepository = userRepository;
        this.questionJson = questionJson;
        this.codeGradeDetails = codeGradeDetails;
        this.accessService = accessService;
        this.analysisClient = analysisClient;
        this.pdfRenderer = pdfRenderer;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public AttemptReport attemptReport(Authentication auth, Long attemptId) {
        Attempt attempt = requireAttempt(auth, attemptId);
        boolean released = attempt.getReleasedAt() != null;

        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(attempt.getExam().getId());
        Map<Long, AnswerRevision> latest = latestAnswers(attemptId);
        Map<Long, AnswerGrade> grades = gradeRepository.findByAttemptId(attemptId).stream()
                .collect(Collectors.toMap(grade -> grade.getQuestion().getId(), Function.identity()));

        List<QuestionReport> questionReports = new ArrayList<>();
        for (Question question : questions) {
            AnswerRevision revision = latest.get(question.getId());
            AnswerGrade grade = grades.get(question.getId());
            AnswerKey key = released ? questionJson.answerKey(question) : null;
            boolean code = question.getType() == QuestionType.CODE;
            CodeGradeDetail codeDetail = released && grade != null
                    ? codeGradeDetails.parse(grade.getDetailJson())
                    : null;
            questionReports.add(new QuestionReport(
                    question.getOrderIndex(),
                    question.getPrompt(),
                    question.getType().name(),
                    question.getPoints(),
                    grade == null ? null : grade.getAwardedPoints(),
                    revision == null ? "" : nullToEmpty(revision.getText()),
                    revision == null ? List.of() : selectedOptions(revision),
                    key == null || key.selectedKeys() == null ? List.of() : key.selectedKeys(),
                    grade == null ? null : grade.getComment(),
                    released ? question.getExplanation() : null,
                    code ? questionJson.content(question).path("language").asText(null) : null,
                    codeDetail));
        }

        List<IntegrityEvent> events = integrityRepository.findByAttemptIdOrderByOccurredAtAsc(attemptId);
        IntegrityReport integrity = new IntegrityReport(
                attempt.getStrikeCount() == null ? 0 : attempt.getStrikeCount(),
                attempt.getMaxStrikes() == null ? 0 : attempt.getMaxStrikes(),
                attempt.getTerminatedAt(),
                events.stream()
                        .map(event -> new IntegritySignal(event.getSignal().name(), event.getOccurredAt()))
                        .toList());

        return new AttemptReport(
                attempt.getId(),
                attempt.getExam().getTitle(),
                attempt.getExam().getCode(),
                attempt.getCandidate().getCode(),
                attempt.getStatus().name(),
                attempt.getScorePoints(),
                attempt.getMaxPoints(),
                released,
                attempt.getSubmittedAt(),
                questionReports,
                integrity,
                // Overlap and authorship signals are staff review aids; students never see them.
                accessService.isStaff(auth) ? reviewSignals(attempt) : List.of());
    }

    @Transactional(readOnly = true)
    public byte[] attemptPdf(Authentication auth, Long attemptId) {
        AttemptReport report = attemptReport(auth, attemptId);
        boolean released = report.released();

        BigDecimal max = report.maxPoints() == null ? BigDecimal.ZERO : report.maxPoints();
        BigDecimal score = report.scorePoints() == null ? BigDecimal.ZERO : report.scorePoints();
        int percentage = percentage(score, max);

        Map<String, Object> model = new LinkedHashMap<>();
        model.put("examTitle", report.examTitle());
        model.put("examCode", report.examCode());
        model.put("candidateCode", report.candidateCode());
        model.put("status", report.status());
        model.put("submittedAt", format(report.submittedAt()));
        model.put("scoreText", score.setScale(2, RoundingMode.HALF_UP).toPlainString());
        model.put("maxPoints", max.setScale(2, RoundingMode.HALF_UP).toPlainString());
        model.put("percentage", percentage);
        model.put("percentageText", String.valueOf(percentage));
        model.put("released", released);
        model.put("generatedAt", TIMESTAMP.format(Instant.now()));

        List<Map<String, Object>> questions = new ArrayList<>();
        for (QuestionReport question : report.questions()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("orderIndex", question.orderIndex());
            row.put("typeLabel", typeLabel(question.type()));
            row.put("points", question.points() == null ? "0" : question.points().stripTrailingZeros().toPlainString());
            row.put("awardedLabel", question.awardedPoints() == null
                    ? "-"
                    : question.awardedPoints().setScale(2, RoundingMode.HALF_UP).toPlainString());
            row.put("prompt", question.prompt());
            row.put("answerText", question.answerText());
            row.put("selectedOptions", question.selectedOptions());
            row.put("correctKeys", question.correctKeys());
            row.put("comment", question.comment());
            row.put("explanation", question.explanation());
            row.put("codeLanguage", question.codeLanguage());
            row.put("codeTests", question.codeDetail() == null
                    ? List.of()
                    : question.codeDetail().tests().stream().map(test -> {
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("name", test.hidden() ? "Hidden case" : test.name());
                        item.put("result", test.passed() ? "Passed" : statusLabel(test.status()));
                        item.put("cssClass", test.passed() ? "ok" : "bad");
                        return item;
                    }).toList());
            questions.add(row);
        }
        model.put("questions", questions);

        Map<String, Object> integrity = new LinkedHashMap<>();
        integrity.put("strikes", report.integrity().strikes());
        integrity.put("maxStrikes", report.integrity().maxStrikes());
        integrity.put("terminatedAt", format(report.integrity().terminatedAt()));
        integrity.put("events", report.integrity().events().stream().map(event -> Map.of(
                "signal", event.signal(),
                "signalLabel", signalLabel(event.signal()),
                "occurredAt", format(event.occurredAt()))).toList());
        model.put("integrity", integrity);

        model.put("reviewSignals", report.reviewSignals().stream().map(signal -> Map.of(
                "band", signal.band(),
                "cssClass", signal.band().toLowerCase(Locale.ROOT),
                "label", signal.label(),
                "score", Math.round(signal.score()),
                "detail", nullToEmpty(signal.detail()))).toList());

        return pdfRenderer.render("reports/attempt", model);
    }

    @Transactional(readOnly = true)
    public ExamReport examReport(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        Exam exam = findExam(examId);
        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(examId);
        List<Attempt> attempts = attemptRepository.findByExamIdOrderByStartedAtAsc(examId);
        List<Long> attemptIds = attempts.stream().map(Attempt::getId).toList();

        List<AnswerGrade> grades = attemptIds.isEmpty() ? List.of() : gradeRepository.findByAttemptIdIn(attemptIds);
        List<AnswerRevision> revisions = attemptIds.isEmpty()
                ? List.of()
                : revisionRepository.findByAttemptIdInOrderByAttemptIdAscQuestionIdAscRevisionNoAsc(attemptIds);

        BigDecimal maxPoints = questions.stream()
                .map(Question::getPoints)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Attempt> graded = attempts.stream().filter(attempt -> attempt.getScorePoints() != null).toList();
        BigDecimal average = graded.isEmpty()
                ? null
                : graded.stream().map(Attempt::getScorePoints).reduce(BigDecimal.ZERO, BigDecimal::add)
                        .divide(BigDecimal.valueOf(graded.size()), 2, RoundingMode.HALF_UP);

        long submitted = attempts.stream().filter(attempt -> attempt.getStatus() == AttemptStatus.SUBMITTED).count();
        long ungraded = attempts.stream()
                .filter(attempt -> (attempt.getStatus() == AttemptStatus.SUBMITTED
                        || attempt.getStatus() == AttemptStatus.TERMINATED)
                        && attempt.getReleasedAt() == null)
                .count();

        Map<Long, List<AnswerGrade>> gradesByQuestion = grades.stream()
                .collect(Collectors.groupingBy(grade -> grade.getQuestion().getId()));
        Map<Long, Long> answeredByQuestion = revisions.stream()
                .filter(revision -> revision.getText() != null && !revision.getText().isBlank()
                        || revision.getSelectedOptions() != null && !revision.getSelectedOptions().isBlank())
                .collect(Collectors.groupingBy(revision -> revision.getQuestion().getId(), Collectors.counting()));

        List<QuestionPerformance> perQuestion = new ArrayList<>();
        for (Question question : questions) {
            List<AnswerGrade> questionGrades = gradesByQuestion.getOrDefault(question.getId(), List.of());
            BigDecimal questionAverage = questionGrades.isEmpty()
                    ? null
                    : questionGrades.stream().map(AnswerGrade::getAwardedPoints)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                            .divide(BigDecimal.valueOf(questionGrades.size()), 2, RoundingMode.HALF_UP);
            perQuestion.add(new QuestionPerformance(
                    question.getOrderIndex(),
                    question.getPrompt(),
                    question.getType().name(),
                    question.getPoints(),
                    questionAverage,
                    answeredByQuestion.getOrDefault(question.getId(), 0L)));
        }

        long terminated = attempts.stream().filter(attempt -> attempt.getStatus() == AttemptStatus.TERMINATED).count();
        int totalFocusLosses = attempts.stream()
                .map(Attempt::getStrikeCount)
                .filter(java.util.Objects::nonNull)
                .mapToInt(Integer::intValue)
                .sum();
        long withStrikes = attempts.stream()
                .filter(attempt -> attempt.getStrikeCount() != null && attempt.getStrikeCount() > 0)
                .count();

        List<FlaggedCandidate> flagged = findingRepository.findByExamIdOrderByPriorityScoreDesc(examId).stream()
                .limit(20)
                .map(this::flagged)
                .toList();

        return new ExamReport(
                exam.getId(),
                exam.getCode(),
                exam.getTitle(),
                exam.getDurationMinutes(),
                questions.size(),
                attempts.size(),
                submitted,
                ungraded,
                average,
                maxPoints,
                distribution(attempts, maxPoints),
                perQuestion,
                new ExamIntegrity(totalFocusLosses, terminated, withStrikes),
                flagged);
    }

    @Transactional(readOnly = true)
    public byte[] examPdf(Authentication auth, Long examId) {
        ExamReport report = examReport(auth, examId);

        Map<String, Object> model = new LinkedHashMap<>();
        model.put("examTitle", report.examTitle());
        model.put("examCode", report.examCode());
        model.put("durationMinutes", report.durationMinutes());
        model.put("questionCount", report.questionCount());
        model.put("attempts", report.attempts());
        model.put("submitted", report.submitted());
        model.put("ungraded", report.ungraded());
        model.put("averageText", report.averageScore() == null
                ? "-"
                : report.averageScore().toPlainString() + " / " + report.maxPoints().toPlainString());
        model.put("distribution", report.distribution().stream().map(bucket -> Map.of(
                "label", bucket.label(),
                "count", bucket.count(),
                "percent", bucket.percent())).toList());
        model.put("perQuestion", report.perQuestion().stream().map(question -> Map.of(
                "orderIndex", question.orderIndex(),
                "prompt", question.prompt(),
                "typeLabel", typeLabel(question.type()),
                "points", question.points() == null ? "0" : question.points().stripTrailingZeros().toPlainString(),
                "averageText", question.averageAwarded() == null ? "-" : question.averageAwarded().toPlainString(),
                "answeredCount", question.answeredCount())).toList());
        model.put("integrity", Map.of(
                "totalFocusLosses", report.integrity().totalFocusLosses(),
                "terminatedAttempts", report.integrity().terminatedAttempts(),
                "attemptsWithStrikes", report.integrity().attemptsWithStrikes()));
        model.put("flagged", report.flagged().stream().map(finding -> Map.of(
                "candidateCode", finding.candidateCode(),
                "label", finding.label(),
                "band", finding.band(),
                "cssClass", finding.band().toLowerCase(Locale.ROOT),
                "score", Math.round(finding.score()))).toList());
        model.put("generatedAt", TIMESTAMP.format(Instant.now()));
        return pdfRenderer.render("reports/exam", model);
    }

    @Transactional(readOnly = true)
    public String examCsv(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        Exam exam = findExam(examId);
        List<String> rows = new ArrayList<>();
        rows.add(CsvWriter.row("candidateCode", "status", "scorePoints", "maxPoints", "released",
                "strikes", "terminatedAt", "submittedAt"));
        for (Attempt attempt : attemptRepository.findByExamIdOrderByStartedAtAsc(examId)) {
            rows.add(CsvWriter.row(
                    attempt.getCandidate().getCode(),
                    attempt.getStatus().name(),
                    attempt.getScorePoints(),
                    attempt.getMaxPoints(),
                    attempt.getReleasedAt() != null,
                    attempt.getStrikeCount(),
                    format(attempt.getTerminatedAt()),
                    format(attempt.getSubmittedAt())));
        }
        return CsvWriter.document(rows);
    }

    @Transactional(readOnly = true)
    public AdminOverview adminOverview(Authentication auth) {
        if (!accessService.isAdmin(auth)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator required");
        }
        List<User> users = userRepository.findAllByOrderByDisplayNameAsc();
        List<Exam> exams = examRepository.findAllByOrderByCreatedAtDesc();
        List<AdminExamRow> recent = exams.stream()
                .limit(10)
                .map(exam -> new AdminExamRow(
                        exam.getId(),
                        exam.getCode(),
                        exam.getTitle(),
                        exam.getStatus().name(),
                        attemptRepository.countByExamId(exam.getId()),
                        findingRepository.countByExamId(exam.getId())))
                .toList();
        return new AdminOverview(
                users.size(),
                users.stream().filter(user -> user.getRole() == Role.LECTURER).count(),
                users.stream().filter(user -> user.getRole() == Role.STUDENT).count(),
                exams.size(),
                attemptRepository.count(),
                exams.stream().mapToLong(exam -> findingRepository.countByExamId(exam.getId())).sum(),
                exams.stream().mapToLong(exam -> findingRepository.countByExamIdAndStatus(
                        exam.getId(), com.examguard.domain.FindingStatus.OPEN)).sum(),
                analysisClient.isHealthy() ? "UP" : "DOWN",
                recent);
    }

    @Transactional(readOnly = true)
    public byte[] adminPdf(Authentication auth) {
        AdminOverview overview = adminOverview(auth);
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("users", overview.users());
        model.put("lecturers", overview.lecturers());
        model.put("students", overview.students());
        model.put("exams", overview.exams());
        model.put("attempts", overview.attempts());
        model.put("findings", overview.findings());
        model.put("openFindings", overview.openFindings());
        model.put("analysisStatus", overview.analysisStatus());
        model.put("recentExams", overview.recentExams());
        model.put("generatedAt", TIMESTAMP.format(Instant.now()));
        return pdfRenderer.render("reports/admin", model);
    }

    private Exam findExam(Long examId) {
        return examRepository.findById(examId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exam not found"));
    }

    private Attempt requireAttempt(Authentication auth, Long attemptId) {
        Attempt attempt = accessService.requireAttemptAccess(auth, attemptId);
        if ("STUDENT".equals(accessService.role(auth)) && attempt.getReleasedAt() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Results have not been released yet");
        }
        return attempt;
    }

    private List<ReviewSignal> reviewSignals(Attempt attempt) {
        Long candidateId = attempt.getCandidate().getId();
        return findingRepository.findByExamIdOrderByPriorityScoreDesc(attempt.getExam().getId()).stream()
                .filter(finding -> (finding.getCandidateA() != null
                        && candidateId.equals(finding.getCandidateA().getId()))
                        || (finding.getCandidateB() != null
                        && candidateId.equals(finding.getCandidateB().getId())))
                .limit(REVIEW_SIGNAL_LIMIT)
                .map(finding -> new ReviewSignal(
                        finding.getType().name(),
                        finding.getType().name().equals("CANDIDATE_PAIR") ? "Answer overlap" : "Activity incident",
                        finding.getPriorityBand().name(),
                        finding.getPriorityScore(),
                        finding.getSummary()))
                .toList();
    }

    private Map<Long, AnswerRevision> latestAnswers(Long attemptId) {
        Map<Long, AnswerRevision> latest = new HashMap<>();
        for (AnswerRevision revision : revisionRepository
                .findByAttemptIdOrderByQuestionIdAscRevisionNoAsc(attemptId)) {
            latest.put(revision.getQuestion().getId(), revision);
        }
        return latest;
    }

    private List<BandBucket> distribution(List<Attempt> attempts, BigDecimal maxPoints) {
        int[] counts = new int[5];
        int scored = 0;
        for (Attempt attempt : attempts) {
            if (attempt.getScorePoints() == null || maxPoints.signum() == 0) {
                continue;
            }
            int percent = percentage(attempt.getScorePoints(), maxPoints);
            int bucket = Math.min(4, percent / 20);
            counts[bucket]++;
            scored++;
        }
        int max = java.util.Arrays.stream(counts).max().orElse(0);
        List<BandBucket> buckets = new ArrayList<>();
        for (int index = 0; index < counts.length; index++) {
            String label = (index * 20) + "-" + ((index + 1) * 20) + "%";
            int width = max == 0 ? 0 : (int) Math.round(counts[index] * 100.0 / max);
            buckets.add(new BandBucket(label, counts[index], width));
        }
        if (scored == 0) {
            return List.of();
        }
        return buckets;
    }

    private FlaggedCandidate flagged(Finding finding) {
        return new FlaggedCandidate(
                finding.getCandidateA().getCode(),
                finding.getType().name().equals("CANDIDATE_PAIR") ? "Answer overlap" : "Activity incident",
                finding.getPriorityBand().name(),
                finding.getPriorityScore());
    }

    private int percentage(BigDecimal score, BigDecimal max) {
        if (score == null || max == null || max.signum() == 0) {
            return 0;
        }
        BigDecimal value = score.multiply(BigDecimal.valueOf(100)).divide(max, 0, RoundingMode.HALF_UP);
        return Math.max(0, Math.min(100, value.intValue()));
    }

    private List<String> selectedOptions(AnswerRevision revision) {
        String raw = revision.getSelectedOptions();
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<List<String>>() {
            });
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }

    private static String typeLabel(String type) {
        return switch (type) {
            case "SINGLE_CHOICE" -> "Single choice";
            case "MULTI_CHOICE" -> "Multiple choice";
            case "TRUE_FALSE" -> "True / false";
            case "SHORT_ANSWER" -> "Short answer";
            case "ESSAY" -> "Essay";
            case "CODE" -> "Coding";
            default -> type;
        };
    }

    private static String statusLabel(String status) {
        return switch (status == null ? "" : status) {
            case "TIMEOUT" -> "Timed out";
            case "COMPILE_ERROR" -> "Did not compile";
            case "RUNTIME_ERROR" -> "Runtime error";
            case "LIMIT_EXCEEDED" -> "Resource limit";
            case "NOT_RUN" -> "Not run";
            default -> "Failed";
        };
    }

    private static String signalLabel(String signal) {
        return switch (signal) {
            case "FOCUS_LOSS" -> "Left the exam window";
            case "FOCUS_RETURN" -> "Returned to the exam window";
            case "VISIBILITY_HIDDEN" -> "Tab hidden";
            default -> signal;
        };
    }

    private static String format(Instant instant) {
        return instant == null ? "" : TIMESTAMP.format(instant);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
