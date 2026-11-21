package com.examguard.exam;

import com.examguard.attempt.CoverageCalculator;
import com.examguard.domain.ActivityEvent;
import com.examguard.domain.AnalysisRun;
import com.examguard.domain.Attempt;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamEnrollment;
import com.examguard.domain.ExamPermission;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.Question;
import com.examguard.domain.ResourceRule;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.attempt.AttemptDtos.AttemptPreflightView;
import com.examguard.exam.ExamDtos.AttemptSummary;
import com.examguard.exam.ExamDtos.CreateExamRequest;
import com.examguard.exam.ExamDtos.CreateRule;
import com.examguard.exam.ExamDtos.ExamDetail;
import com.examguard.exam.ExamDtos.ExamSummary;
import com.examguard.exam.ExamDtos.PermissionRequest;
import com.examguard.exam.ExamDtos.PermissionView;
import com.examguard.exam.ExamDtos.RosterEntryView;
import com.examguard.exam.ExamDtos.StaffQuestionView;
import com.examguard.exam.ExamDtos.UpdateExamRequest;
import com.examguard.repo.ActivityEventRepository;
import com.examguard.repo.AnalysisRunRepository;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.ExamEnrollmentRepository;
import com.examguard.repo.ExamPermissionRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.FindingRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.repo.ResourceRuleRepository;
import com.examguard.repo.UserRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

@Service
public class ExamService {

    private final ExamRepository examRepository;
    private final QuestionRepository questionRepository;
    private final ResourceRuleRepository ruleRepository;
    private final ExamPermissionRepository permissionRepository;
    private final AttemptRepository attemptRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final ActivityEventRepository eventRepository;
    private final FindingRepository findingRepository;
    private final AnalysisRunRepository runRepository;
    private final UserRepository userRepository;
    private final ExamEnrollmentRepository enrollmentRepository;
    private final QuestionService questionService;
    private final AccessService accessService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    public ExamService(
            ExamRepository examRepository,
            QuestionRepository questionRepository,
            ResourceRuleRepository ruleRepository,
            ExamPermissionRepository permissionRepository,
            AttemptRepository attemptRepository,
            AnswerRevisionRepository revisionRepository,
            ActivityEventRepository eventRepository,
            FindingRepository findingRepository,
            AnalysisRunRepository runRepository,
            UserRepository userRepository,
            ExamEnrollmentRepository enrollmentRepository,
            QuestionService questionService,
            AccessService accessService,
            AuditService auditService,
            ObjectMapper objectMapper) {
        this.examRepository = examRepository;
        this.questionRepository = questionRepository;
        this.ruleRepository = ruleRepository;
        this.permissionRepository = permissionRepository;
        this.attemptRepository = attemptRepository;
        this.revisionRepository = revisionRepository;
        this.eventRepository = eventRepository;
        this.findingRepository = findingRepository;
        this.runRepository = runRepository;
        this.userRepository = userRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.questionService = questionService;
        this.accessService = accessService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<ExamSummary> list(Authentication auth) {
        accessService.requireStaff(auth);
        boolean seesAll = accessService.isAdmin(auth) || accessService.isReviewer(auth);
        List<Exam> exams = seesAll
                ? examRepository.findAllByOrderByCreatedAtDesc()
                : examRepository.findAllForUser(accessService.actorId(auth));
        return exams.stream()
                .map(exam -> ExamMapper.summary(exam, counts(exam.getId())))
                .toList();
    }

    @Transactional
    public ExamDetail create(Authentication auth, CreateExamRequest request) {
        requireExamAuthor(auth);
        String code = request.code().trim();
        if (examRepository.findByCodeIgnoreCase(code).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Exam code already exists");
        }
        if (request.resourceRules() != null) {
            request.resourceRules().forEach(this::validateRule);
        }
        validateWindow(request.opensAt(), request.closesAt());

        User creator = accessService.currentUser(auth);
        Exam exam = new Exam();
        exam.setCode(code);
        exam.setTitle(request.title().trim());
        exam.setDescription(request.description());
        exam.setDurationMinutes(request.durationMinutes());
        exam.setStatus(ExamStatus.DRAFT);
        exam.setAllowExtension(request.allowExtension() == null || request.allowExtension());
        exam.setMaxStrikes(request.maxStrikes() == null ? 3 : request.maxStrikes());
        exam.setInstructions(request.instructions());
        exam.setOpensAt(request.opensAt());
        exam.setClosesAt(request.closesAt());
        exam.setRequiresPin(request.requiresPin() == null || request.requiresPin());
        exam.setRequiresPreflight(request.requiresPreflight() == null || request.requiresPreflight());
        exam.setCreatedBy(creator);
        exam = examRepository.save(exam);

        List<Question> questions = questionService.createAll(exam, request.questions());
        List<ResourceRule> rules = saveRules(exam, request.resourceRules());
        ExamPermission owner = savePermission(exam, creator, PermissionLevel.OWNER);

        auditService.record(creator, exam.getId(), "EXAM_CREATED", "EXAM", exam.getId(),
                Map.of("code", exam.getCode(), "title", exam.getTitle()));

        return ExamMapper.detail(exam, counts(exam.getId()), questionViews(questions), rules, List.of(owner));
    }

    @Transactional(readOnly = true)
    public ExamDetail detail(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        Exam exam = findExam(examId);
        return ExamMapper.detail(exam, counts(examId), questionViews(examId), rules(examId), permissions(examId));
    }

    @Transactional
    public ExamDetail updateStatus(Authentication auth, Long examId, ExamStatus target) {
        accessService.requireExamOwner(auth, examId);
        Exam exam = findExam(examId);
        if (!isManualTransitionAllowed(exam.getStatus(), target)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Status cannot change from " + exam.getStatus() + " to " + target);
        }
        ExamStatus previous = exam.getStatus();
        exam.setStatus(target);
        examRepository.save(exam);
        auditService.record(accessService.currentUser(auth), examId, "EXAM_STATUS_CHANGED", "EXAM", examId,
                Map.of("from", previous.name(), "to", target.name()));
        return ExamMapper.detail(exam, counts(examId), questionViews(examId), rules(examId), permissions(examId));
    }

    @Transactional
    public ExamDetail updateSettings(Authentication auth, Long examId, UpdateExamRequest request) {
        accessService.requireExamOwner(auth, examId);
        Exam exam = findExam(examId);
        validateWindow(request.opensAt(), request.closesAt());
        if (request.resourceRules() != null) {
            request.resourceRules().forEach(this::validateRule);
        }

        List<String> changed = new ArrayList<>();
        String title = request.title().trim();
        if (!Objects.equals(exam.getTitle(), title)) {
            exam.setTitle(title);
            changed.add("title");
        }
        if (!Objects.equals(exam.getDescription(), request.description())) {
            exam.setDescription(request.description());
            changed.add("description");
        }
        if (!Objects.equals(exam.getDurationMinutes(), request.durationMinutes())) {
            exam.setDurationMinutes(request.durationMinutes());
            changed.add("durationMinutes");
        }
        Boolean allowExtension = request.allowExtension();
        if (allowExtension != null && exam.isAllowExtension() != allowExtension) {
            exam.setAllowExtension(allowExtension);
            changed.add("allowExtension");
        }
        if (!Objects.equals(exam.getMaxStrikes(), request.maxStrikes())) {
            exam.setMaxStrikes(request.maxStrikes());
            changed.add("maxStrikes");
        }
        if (!Objects.equals(exam.getInstructions(), request.instructions())) {
            exam.setInstructions(request.instructions());
            changed.add("instructions");
        }
        if (!Objects.equals(exam.getOpensAt(), request.opensAt())) {
            exam.setOpensAt(request.opensAt());
            changed.add("opensAt");
        }
        if (!Objects.equals(exam.getClosesAt(), request.closesAt())) {
            exam.setClosesAt(request.closesAt());
            changed.add("closesAt");
        }
        if (request.requiresPin() != null && exam.isRequiresPin() != request.requiresPin()) {
            exam.setRequiresPin(request.requiresPin());
            changed.add("requiresPin");
        }
        if (request.requiresPreflight() != null
                && exam.isRequiresPreflight() != request.requiresPreflight()) {
            exam.setRequiresPreflight(request.requiresPreflight());
            changed.add("requiresPreflight");
        }
        examRepository.save(exam);

        if (request.resourceRules() != null) {
            ruleRepository.deleteByExamId(examId);
            saveRules(exam, request.resourceRules());
            changed.add("resourceRules");
        }

        auditService.record(accessService.currentUser(auth), examId, "EXAM_SETTINGS_UPDATED", "EXAM", examId,
                Map.of("fields", changed));
        return ExamMapper.detail(exam, counts(examId), questionViews(examId), rules(examId), permissions(examId));
    }

    @Transactional(readOnly = true)
    public List<RosterEntryView> roster(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        return enrollmentRepository.findByExamIdOrderByEmailAsc(examId).stream()
                .map(ExamMapper::rosterEntry)
                .toList();
    }

    @Transactional
    public RosterEntryView addRosterEntry(Authentication auth, Long examId, String rawEmail) {
        accessService.requireExamOwner(auth, examId);
        Exam exam = findExam(examId);
        String email = normalizeEmail(rawEmail);
        if (enrollmentRepository.existsByExamIdAndEmailIgnoreCase(examId, email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This email is already enrolled");
        }
        ExamEnrollment enrollment = new ExamEnrollment();
        enrollment.setExam(exam);
        enrollment.setEmail(email);
        enrollment = enrollmentRepository.save(enrollment);
        auditService.record(accessService.currentUser(auth), examId, "ROSTER_ENTRY_ADDED", "EXAM_ENROLLMENT",
                enrollment.getId(), Map.of("email", email));
        return ExamMapper.rosterEntry(enrollment);
    }

    @Transactional
    public void removeRosterEntry(Authentication auth, Long examId, Long entryId) {
        accessService.requireExamOwner(auth, examId);
        ExamEnrollment enrollment = enrollmentRepository.findByIdAndExamId(entryId, examId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Roster entry not found"));
        enrollmentRepository.delete(enrollment);
        auditService.record(accessService.currentUser(auth), examId, "ROSTER_ENTRY_REMOVED", "EXAM_ENROLLMENT",
                entryId, Map.of("email", enrollment.getEmail()));
    }

    @Transactional
    public PermissionView addPermission(Authentication auth, Long examId, PermissionRequest request) {
        accessService.requireExamOwner(auth, examId);
        Exam exam = findExam(examId);
        User target = resolvePermissionTarget(request);

        ExamPermission permission = permissionRepository.findByExamIdAndUserId(examId, target.getId())
                .orElseGet(ExamPermission::new);
        permission.setExam(exam);
        permission.setUser(target);
        permission.setLevel(request.level());
        permissionRepository.save(permission);

        auditService.record(accessService.currentUser(auth), examId, "PERMISSION_GRANTED", "EXAM_PERMISSION",
                permission.getId(), Map.of("userId", target.getId(), "level", request.level().name()));
        return ExamMapper.permission(permission);
    }

    @Transactional
    public void removePermission(Authentication auth, Long examId, Long userId) {
        accessService.requireExamOwner(auth, examId);
        ExamPermission permission = permissionRepository.findByExamIdAndUserId(examId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Permission not found"));
        if (permission.getLevel() == PermissionLevel.OWNER
                && permissionRepository.countByExamIdAndLevel(examId, PermissionLevel.OWNER) <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An exam must keep at least one owner");
        }
        permissionRepository.delete(permission);
        auditService.record(accessService.currentUser(auth), examId, "PERMISSION_REVOKED", "EXAM_PERMISSION",
                permission.getId(), Map.of("userId", userId));
    }

    @Transactional(readOnly = true)
    public List<PermissionView> permissions(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        return permissions(examId).stream().map(ExamMapper::permission).toList();
    }

    @Transactional(readOnly = true)
    public List<AttemptSummary> attempts(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        return attemptRepository.findByExamIdOrderByStartedAtAsc(examId).stream()
                .map(this::toAttemptSummary)
                .toList();
    }

    private AttemptSummary toAttemptSummary(Attempt attempt) {
        List<ActivityEvent> events = eventRepository.findByAttemptIdOrderByOccurredAtAsc(attempt.getId());
        Instant monitoringEnd = attempt.getSubmittedAt() != null
                ? attempt.getSubmittedAt()
                : attempt.getLastSeenAt() != null ? attempt.getLastSeenAt() : Instant.now();
        CoverageCalculator.Coverage coverage = CoverageCalculator.compute(
                attempt.getStartedAt(), monitoringEnd,
                events.stream().map(ActivityEvent::getOccurredAt).toList());
        Candidate candidate = attempt.getCandidate();
        return new AttemptSummary(
                attempt.getId(),
                candidate.getCode(),
                attempt.getStatus(),
                attempt.getStartedAt(),
                attempt.getActiveStartedAt(),
                attempt.getSubmittedAt(),
                attempt.getLastSeenAt(),
                attempt.getPreflightCompletedAt(),
                attempt.isAutoSubmitted(),
                attempt.getProfilePhoto() != null,
                revisionRepository.countAnsweredQuestions(attempt.getId()),
                events.size(),
                coverage.percent(),
                coverage.warning(),
                attempt.isLateSubmission());
    }

    @Transactional(readOnly = true)
    public AttemptPreflightView preflight(Authentication auth, Long examId, Long attemptId) {
        accessService.requireExamView(auth, examId);
        Attempt attempt = attemptRepository.findById(attemptId)
                .filter(found -> found.getExam().getId().equals(examId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attempt not found"));
        return new AttemptPreflightView(
                attempt.getPreflightCompletedAt(),
                attempt.getPhotoTakenAt(),
                attempt.getProfilePhoto(),
                preflightChecks(attempt.getPreflightJson()));
    }

    private Map<String, Object> preflightChecks(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (JsonProcessingException ex) {
            return Map.of();
        }
    }

    private ExamMapper.Counts counts(Long examId) {
        Instant lastAnalysisAt = runRepository.findByExamIdOrderByStartedAtDesc(examId).stream()
                .findFirst()
                .map(AnalysisRun::getStartedAt)
                .orElse(null);
        return new ExamMapper.Counts(
                attemptRepository.countByExamId(examId),
                attemptRepository.countByExamIdAndStatus(examId, com.examguard.domain.AttemptStatus.SUBMITTED),
                findingRepository.countByExamId(examId),
                findingRepository.countByExamIdAndStatus(examId, FindingStatus.OPEN),
                lastAnalysisAt,
                enrollmentRepository.countByExamId(examId),
                attemptRepository.countByExamIdAndReleasedAtIsNotNull(examId),
                attemptRepository.countByExamIdAndStatusAndReleasedAtIsNull(
                        examId, com.examguard.domain.AttemptStatus.SUBMITTED));
    }

    private List<StaffQuestionView> questionViews(Long examId) {
        return questionViews(questions(examId));
    }

    private List<StaffQuestionView> questionViews(List<Question> questions) {
        return questions.stream().map(questionService::view).toList();
    }

    private List<ResourceRule> saveRules(Exam exam, List<CreateRule> requests) {
        if (requests == null) {
            return List.of();
        }
        for (CreateRule request : requests) {
            ResourceRule rule = new ResourceRule();
            rule.setExam(exam);
            rule.setCategory(request.category());
            rule.setDomainPattern(request.domainPattern().trim().toLowerCase());
            rule.setNote(request.note());
            ruleRepository.save(rule);
        }
        return rules(exam.getId());
    }

    private ExamPermission savePermission(Exam exam, User user, PermissionLevel level) {
        ExamPermission permission = new ExamPermission();
        permission.setExam(exam);
        permission.setUser(user);
        permission.setLevel(level);
        return permissionRepository.save(permission);
    }

    private void validateRule(CreateRule rule) {
        String pattern = rule.domainPattern().trim();
        if (pattern.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Domain pattern is required");
        }
        if (pattern.startsWith("re:")) {
            try {
                Pattern.compile(pattern.substring(3));
            } catch (PatternSyntaxException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid regex domain pattern");
            }
        }
    }

    private void validateWindow(Instant opensAt, Instant closesAt) {
        if (opensAt != null && closesAt != null && !opensAt.isBefore(closesAt)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The exam must close after it opens");
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private boolean isManualTransitionAllowed(ExamStatus current, ExamStatus target) {
        return (current == ExamStatus.DRAFT && target == ExamStatus.OPEN)
                || (current == ExamStatus.OPEN && target == ExamStatus.CLOSED);
    }

    private void requireExamAuthor(Authentication auth) {
        String role = accessService.role(auth);
        if (!Role.LECTURER.name().equals(role) && !Role.ADMIN.name().equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Lecturer or administrator required");
        }
    }

    private User resolvePermissionTarget(PermissionRequest request) {
        if (request.userId() != null) {
            return userRepository.findById(request.userId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        }
        if (request.email() == null || request.email().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A userId or email is required");
        }
        return userRepository.findByEmailIgnoreCase(request.email().trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private Exam findExam(Long examId) {
        return examRepository.findById(examId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exam not found"));
    }

    private List<Question> questions(Long examId) {
        return questionRepository.findByExamIdOrderByOrderIndexAsc(examId);
    }

    private List<ResourceRule> rules(Long examId) {
        return ruleRepository.findByExamIdOrderByIdAsc(examId);
    }

    private List<ExamPermission> permissions(Long examId) {
        return permissionRepository.findByExamIdOrderByUserDisplayNameAsc(examId);
    }
}
