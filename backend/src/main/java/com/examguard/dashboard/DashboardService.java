package com.examguard.dashboard;

import com.examguard.dashboard.DashboardDtos.AdminCounts;
import com.examguard.dashboard.DashboardDtos.AdminDashboard;
import com.examguard.dashboard.DashboardDtos.AuditRow;
import com.examguard.dashboard.DashboardDtos.BandCount;
import com.examguard.dashboard.DashboardDtos.ExamHealth;
import com.examguard.dashboard.DashboardDtos.FlaggedCandidate;
import com.examguard.dashboard.DashboardDtos.FocusLossPoint;
import com.examguard.dashboard.DashboardDtos.FunnelStage;
import com.examguard.dashboard.DashboardDtos.LecturerDashboard;
import com.examguard.dashboard.DashboardDtos.RunRow;
import com.examguard.dashboard.DashboardDtos.ScoreBucket;
import com.examguard.dashboard.DashboardDtos.StudentDashboard;
import com.examguard.dashboard.DashboardDtos.StudentStats;
import com.examguard.dashboard.DashboardDtos.UngradedAttempt;
import com.examguard.dashboard.DashboardDtos.UpcomingExam;
import com.examguard.domain.AnswerGrade;
import com.examguard.domain.AnalysisRun;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.AuditLog;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamEnrollment;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Finding;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.IntegrityEvent;
import com.examguard.domain.IntegritySignal;
import com.examguard.domain.PriorityBand;
import com.examguard.domain.Question;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.AnalysisRunRepository;
import com.examguard.repo.AnswerGradeRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.AuditLogRepository;
import com.examguard.repo.ExamEnrollmentRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.FindingRepository;
import com.examguard.repo.IntegrityEventRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.repo.UserRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AnalysisClient;
import com.examguard.student.StudentDtos.StudentAttemptSummary;
import com.examguard.student.StudentService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

@Service
public class DashboardService {

    private static final List<FindingStatus> ACTIVE_STATUSES =
            List.of(FindingStatus.OPEN, FindingStatus.NEEDS_INFO, FindingStatus.ESCALATED);

    private static final int TREND_DAYS = 14;

    private final AccessService accessService;
    private final StudentService studentService;
    private final ExamRepository examRepository;
    private final ExamEnrollmentRepository enrollmentRepository;
    private final AttemptRepository attemptRepository;
    private final QuestionRepository questionRepository;
    private final AnswerGradeRepository gradeRepository;
    private final FindingRepository findingRepository;
    private final IntegrityEventRepository integrityEventRepository;
    private final AnalysisRunRepository runRepository;
    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final AnalysisClient analysisClient;

    public DashboardService(
            AccessService accessService,
            StudentService studentService,
            ExamRepository examRepository,
            ExamEnrollmentRepository enrollmentRepository,
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository,
            AnswerGradeRepository gradeRepository,
            FindingRepository findingRepository,
            IntegrityEventRepository integrityEventRepository,
            AnalysisRunRepository runRepository,
            AuditLogRepository auditLogRepository,
            UserRepository userRepository,
            AnalysisClient analysisClient) {
        this.accessService = accessService;
        this.studentService = studentService;
        this.examRepository = examRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
        this.gradeRepository = gradeRepository;
        this.findingRepository = findingRepository;
        this.integrityEventRepository = integrityEventRepository;
        this.runRepository = runRepository;
        this.auditLogRepository = auditLogRepository;
        this.userRepository = userRepository;
        this.analysisClient = analysisClient;
    }

    @Transactional(readOnly = true)
    public StudentDashboard student(Authentication auth) {
        if (!AccessService.SCOPE_ACCOUNT.equals(accessService.scope(auth))
                || !"STUDENT".equals(accessService.role(auth))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Student account token required");
        }
        List<StudentAttemptSummary> attempts = studentService.attempts(auth);

        long submitted = attempts.stream()
                .filter(item -> item.status() == AttemptStatus.SUBMITTED)
                .count();
        long terminated = attempts.stream()
                .filter(item -> item.status() == AttemptStatus.TERMINATED)
                .count();
        long released = attempts.stream().filter(StudentAttemptSummary::released).count();
        int strikes = attempts.stream().mapToInt(StudentAttemptSummary::strikes).sum();

        BigDecimal totalPercent = BigDecimal.ZERO;
        int scored = 0;
        for (StudentAttemptSummary attempt : attempts) {
            if (attempt.released() && attempt.scorePoints() != null
                    && attempt.maxPoints() != null && attempt.maxPoints().signum() > 0) {
                totalPercent = totalPercent.add(attempt.scorePoints()
                        .multiply(BigDecimal.valueOf(100))
                        .divide(attempt.maxPoints(), 1, RoundingMode.HALF_UP));
                scored += 1;
            }
        }
        BigDecimal average = scored == 0
                ? null
                : totalPercent.divide(BigDecimal.valueOf(scored), 1, RoundingMode.HALF_UP);

        return new StudentDashboard(
                studentService.me(auth),
                new StudentStats(attempts.size(), submitted, terminated, released, average, strikes),
                upcoming(auth),
                attempts);
    }

    /** Enrolled exams that are open and have no attempt yet; closed windows are filtered out. */
    private List<UpcomingExam> upcoming(Authentication auth) {
        User student = userRepository.findById(accessService.actorId(auth))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        Set<Long> attemptedExamIds = attemptRepository
                .findByStudentUserIdOrderByStartedAtDesc(student.getId()).stream()
                .map(attempt -> attempt.getExam().getId())
                .collect(Collectors.toSet());
        Instant now = Instant.now();
        return enrollmentRepository.findByEmailIgnoreCase(student.getEmail()).stream()
                .map(ExamEnrollment::getExam)
                .filter(exam -> exam.getStatus() == ExamStatus.OPEN)
                .filter(exam -> !attemptedExamIds.contains(exam.getId()))
                .filter(exam -> exam.getClosesAt() == null || exam.getClosesAt().isAfter(now))
                .sorted(Comparator.comparing(Exam::getOpensAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(exam -> new UpcomingExam(
                        exam.getId(),
                        exam.getCode(),
                        exam.getTitle(),
                        exam.getOpensAt(),
                        exam.getClosesAt(),
                        exam.getOpensAt() == null || !now.isBefore(exam.getOpensAt())))
                .toList();
    }

    @Transactional(readOnly = true)
    public LecturerDashboard lecturer(Authentication auth) {
        accessService.requireStaff(auth);
        List<Exam> exams = accessibleExams(auth);

        List<ExamHealth> health = new ArrayList<>();
        List<UngradedAttempt> ungradedQueue = new ArrayList<>();
        List<FlaggedCandidate> flagged = new ArrayList<>();
        List<Long> examIds = new ArrayList<>();
        Map<PriorityBand, Long> bandCounts = new EnumMap<>(PriorityBand.class);
        for (PriorityBand band : PriorityBand.values()) {
            bandCounts.put(band, 0L);
        }
        long ungradedTotal = 0;
        long awaitingRelease = 0;
        long attemptsTotal = 0;
        long submittedTotal = 0;
        long gradedTotal = 0;
        long releasedTotal = 0;

        for (Exam exam : exams) {
            examIds.add(exam.getId());
            long examAttempts = attemptRepository.countByExamId(exam.getId());
            attemptsTotal += examAttempts;
            List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(exam.getId());
            long manualQuestions = questions.stream()
                    .filter(question -> question.getGradingMode() == GradingMode.MANUAL)
                    .count();

            List<Attempt> submittedAttempts =
                    attemptRepository.findByExamIdAndStatusWithCandidate(exam.getId(), AttemptStatus.SUBMITTED);
            Map<Long, Set<Long>> gradedQuestions = new HashMap<>();
            if (!submittedAttempts.isEmpty()) {
                List<Long> attemptIds = submittedAttempts.stream().map(Attempt::getId).toList();
                for (AnswerGrade grade : gradeRepository.findByAttemptIdIn(attemptIds)) {
                    gradedQuestions
                            .computeIfAbsent(grade.getAttempt().getId(), key -> new HashSet<>())
                            .add(grade.getQuestion().getId());
                }
            }

            long examUngraded = 0;
            long pendingRelease = 0;
            for (Attempt attempt : submittedAttempts) {
                long graded = gradedQuestions.getOrDefault(attempt.getId(), Set.of()).size();
                long pending = Math.max(0, manualQuestions - graded);
                examUngraded += pending;
                if (pending > 0) {
                    ungradedQueue.add(new UngradedAttempt(
                            attempt.getId(),
                            exam.getId(),
                            exam.getTitle(),
                            attempt.getCandidate().getCode(),
                            attempt.getStatus(),
                            pending));
                }
                if (attempt.getReleasedAt() == null) {
                    pendingRelease += 1;
                }
            }
            ungradedTotal += examUngraded;
            awaitingRelease += pendingRelease;
            submittedTotal += submittedAttempts.size();
            for (Attempt attempt : submittedAttempts) {
                if (attempt.getGradedAt() != null) {
                    gradedTotal += 1;
                }
                if (attempt.getReleasedAt() != null) {
                    releasedTotal += 1;
                }
            }

            List<Finding> examFindings = findingRepository
                    .findByExamIdAndStatusIn(exam.getId(), ACTIVE_STATUSES);
            for (Finding finding : examFindings) {
                if (finding.getPriorityBand() != null) {
                    bandCounts.merge(finding.getPriorityBand(), 1L, Long::sum);
                }
            }
            examFindings.stream()
                    .sorted(Comparator.comparingDouble(Finding::getPriorityScore).reversed())
                    .limit(10)
                    .forEach(finding -> flagged.add(new FlaggedCandidate(
                            finding.getId(),
                            exam.getId(),
                            exam.getTitle(),
                            finding.getCandidateA().getCode(),
                            finding.getPriorityScore(),
                            finding.getPriorityBand(),
                            finding.getType())));

            Instant lastAnalysisAt = runRepository.findByExamIdOrderByStartedAtDesc(exam.getId()).stream()
                    .findFirst()
                    .map(AnalysisRun::getStartedAt)
                    .orElse(null);

            health.add(new ExamHealth(
                    exam.getId(),
                    exam.getCode(),
                    exam.getTitle(),
                    exam.getStatus(),
                    examAttempts,
                    submittedAttempts.size(),
                    examUngraded,
                    findingRepository.countByExamIdAndStatus(exam.getId(), FindingStatus.OPEN),
                    examFindings.size(),
                    pendingRelease,
                    lastAnalysisAt));
        }

        flagged.sort(Comparator.comparingDouble(FlaggedCandidate::priorityScore).reversed());
        List<FlaggedCandidate> topFlagged = flagged.size() > 15
                ? new ArrayList<>(flagged.subList(0, 15))
                : flagged;
        ungradedQueue.sort(Comparator.comparingLong(UngradedAttempt::pendingQuestions).reversed());

        return new LecturerDashboard(
                health,
                ungradedQueue,
                topFlagged,
                distribution(exams),
                integrityTrend(examIds),
                bandCounts.entrySet().stream()
                        .map(entry -> new BandCount(entry.getKey(), entry.getValue()))
                        .toList(),
                List.of(
                        new FunnelStage("Attempts", attemptsTotal),
                        new FunnelStage("Submitted", submittedTotal),
                        new FunnelStage("Graded", gradedTotal),
                        new FunnelStage("Released", releasedTotal)),
                ungradedTotal,
                topFlagged.size(),
                awaitingRelease);
    }

    /** Focus-loss signals per UTC day for the last 14 days across the lecturer's exams. */
    private List<FocusLossPoint> integrityTrend(List<Long> examIds) {
        ZoneOffset utc = ZoneOffset.UTC;
        LocalDate firstDay = LocalDate.now(utc).minusDays(TREND_DAYS - 1L);
        Map<LocalDate, Long> counts = new TreeMap<>();
        for (int offset = 0; offset < TREND_DAYS; offset++) {
            counts.put(firstDay.plusDays(offset), 0L);
        }
        if (!examIds.isEmpty()) {
            Instant after = firstDay.atStartOfDay(utc).toInstant();
            for (IntegrityEvent event : integrityEventRepository
                    .findByAttempt_Exam_IdInAndSignalAndOccurredAtAfterOrderByOccurredAtAsc(
                            examIds, IntegritySignal.FOCUS_LOSS, after)) {
                LocalDate day = event.getOccurredAt().atZone(utc).toLocalDate();
                counts.computeIfPresent(day, (key, count) -> count + 1);
            }
        }
        return counts.entrySet().stream()
                .map(entry -> new FocusLossPoint(entry.getKey().toString(), entry.getValue()))
                .toList();
    }

    @Transactional(readOnly = true)
    public AdminDashboard admin(Authentication auth) {
        if (!"ADMIN".equals(accessService.role(auth))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator role required");
        }
        List<Exam> exams = examRepository.findAllByOrderByCreatedAtDesc();
        long findings = exams.stream().mapToLong(exam -> findingRepository.countByExamId(exam.getId())).sum();

        AdminCounts counts = new AdminCounts(
                userRepository.count(),
                userRepository.countByRole(Role.STUDENT),
                userRepository.countByRole(Role.LECTURER),
                userRepository.countByRole(Role.ADMIN),
                exams.size(),
                attemptRepository.count(),
                findings);

        List<RunRow> runs = runRepository.findTop10ByOrderByStartedAtDesc().stream()
                .map(run -> new RunRow(
                        run.getId(),
                        run.getExam().getId(),
                        run.getExam().getTitle(),
                        run.getStatus(),
                        run.getModelVersion(),
                        run.getStartedAt(),
                        run.getFinishedAt()))
                .toList();

        List<AuditRow> audit = auditLogRepository.findTop20ByOrderByCreatedAtDesc().stream()
                .map(DashboardService::auditRow)
                .toList();

        return new AdminDashboard(counts, analysisClient.isHealthy(), runs, audit);
    }

    private List<Exam> accessibleExams(Authentication auth) {
        if ("ADMIN".equals(accessService.role(auth)) || "REVIEWER".equals(accessService.role(auth))) {
            return examRepository.findAllByOrderByCreatedAtDesc();
        }
        return examRepository.findAllForUser(accessService.actorId(auth));
    }

    /** Released percentages grouped into 20-point buckets, matching the dashboard chart. */
    private List<ScoreBucket> distribution(List<Exam> exams) {
        long[] buckets = new long[5];
        for (Exam exam : exams) {
            for (Attempt attempt : attemptRepository.findByExamIdAndStatusWithCandidate(
                    exam.getId(), AttemptStatus.SUBMITTED)) {
                if (attempt.getReleasedAt() == null
                        || attempt.getScorePoints() == null
                        || attempt.getMaxPoints() == null
                        || attempt.getMaxPoints().signum() <= 0) {
                    continue;
                }
                int percent = attempt.getScorePoints()
                        .multiply(BigDecimal.valueOf(100))
                        .divide(attempt.getMaxPoints(), 0, RoundingMode.HALF_UP)
                        .intValue();
                int index = Math.min(4, Math.max(0, percent / 20));
                buckets[index] += 1;
            }
        }
        List<ScoreBucket> result = new ArrayList<>(5);
        String[] labels = {"0–19", "20–39", "40–59", "60–79", "80–100"};
        for (int index = 0; index < labels.length; index++) {
            result.add(new ScoreBucket(labels[index], buckets[index]));
        }
        return result;
    }

    private static AuditRow auditRow(AuditLog log) {
        return new AuditRow(
                log.getId(),
                log.getAction(),
                log.getEntityType(),
                log.getEntityId(),
                log.getExamId(),
                log.getActor() == null ? "system" : log.getActor().getDisplayName(),
                log.getCreatedAt());
    }
}
