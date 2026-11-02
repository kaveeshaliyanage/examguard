package com.examguard.exam;

import com.examguard.attempt.CoverageCalculator;
import com.examguard.domain.ActivityEvent;
import com.examguard.domain.AnalysisRun;
import com.examguard.domain.Attempt;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamPermission;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.Question;
import com.examguard.domain.ResourceRule;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.exam.ExamDtos.AttemptSummary;
import com.examguard.exam.ExamDtos.CreateExamRequest;
import com.examguard.exam.ExamDtos.CreateQuestion;
import com.examguard.exam.ExamDtos.CreateRule;
import com.examguard.exam.ExamDtos.ExamDetail;
import com.examguard.exam.ExamDtos.ExamSummary;
import com.examguard.exam.ExamDtos.PermissionRequest;
import com.examguard.exam.ExamDtos.PermissionView;
import com.examguard.repo.ActivityEventRepository;
import com.examguard.repo.AnalysisRunRepository;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.ExamPermissionRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.FindingRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.repo.ResourceRuleRepository;
import com.examguard.repo.UserRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
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
    private final AccessService accessService;
    private final AuditService auditService;

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
            AccessService accessService,
            AuditService auditService) {
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
        this.accessService = accessService;
        this.auditService = auditService;
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
        request.resourceRules().forEach(this::validateRule);

        User creator = accessService.currentUser(auth);
        Exam exam = new Exam();
        exam.setCode(code);
        exam.setTitle(request.title().trim());
        exam.setDescription(request.description());
        exam.setDurationMinutes(request.durationMinutes());
        exam.setStatus(ExamStatus.DRAFT);
        exam.setAllowExtension(request.allowExtension() == null || request.allowExtension());
        exam.setCreatedBy(creator);
        exam = examRepository.save(exam);

        List<Question> questions = saveQuestions(exam, request.questions());
        List<ResourceRule> rules = saveRules(exam, request.resourceRules());
        ExamPermission owner = savePermission(exam, creator, PermissionLevel.OWNER);

        auditService.record(creator, exam.getId(), "EXAM_CREATED", "EXAM", exam.getId(),
                Map.of("code", exam.getCode(), "title", exam.getTitle()));

        return ExamMapper.detail(exam, counts(exam.getId()), questions, rules, List.of(owner));
    }

    @Transactional(readOnly = true)
    public ExamDetail detail(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        Exam exam = findExam(examId);
        return ExamMapper.detail(exam, counts(examId), questions(examId), rules(examId), permissions(examId));
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
        return ExamMapper.detail(exam, counts(examId), questions(examId), rules(examId), permissions(examId));
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
                attempt.getSubmittedAt(),
                attempt.getLastSeenAt(),
                revisionRepository.countAnsweredQuestions(attempt.getId()),
                events.size(),
                coverage.percent(),
                coverage.warning(),
                attempt.isLateSubmission());
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
                lastAnalysisAt);
    }

    private List<Question> saveQuestions(Exam exam, List<CreateQuestion> requests) {
        for (int index = 0; index < requests.size(); index++) {
            CreateQuestion request = requests.get(index);
            Question question = new Question();
            question.setExam(exam);
            question.setOrderIndex(index + 1);
            question.setPrompt(request.prompt().trim());
            question.setMaxWords(request.maxWords());
            questionRepository.save(question);
        }
        return questions(exam.getId());
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
