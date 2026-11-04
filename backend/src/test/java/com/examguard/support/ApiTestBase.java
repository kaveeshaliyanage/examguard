package com.examguard.support;

import com.examguard.config.JwtService;
import com.examguard.domain.AnalysisRun;
import com.examguard.domain.AnalysisStatus;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamPermission;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Finding;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.FindingType;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.PriorityBand;
import com.examguard.domain.Question;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.ActivityEventRepository;
import com.examguard.repo.AnalysisRunRepository;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.AuditLogRepository;
import com.examguard.repo.CandidateRepository;
import com.examguard.repo.EvidenceItemRepository;
import com.examguard.repo.ExamPermissionRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.FindingRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.repo.ResourceRuleRepository;
import com.examguard.repo.ReviewDecisionRepository;
import com.examguard.repo.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Shared fixtures for HTTP-level tests. Every test creates its own users and exams with unique
 * codes so classes can share one Spring context without interfering with each other.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class ApiTestBase {

    @Autowired
    protected MockMvc mvc;
    @Autowired
    protected ObjectMapper json;
    @Autowired
    protected PasswordEncoder passwordEncoder;
    @Autowired
    protected JwtService jwtService;
    @Autowired
    protected UserRepository userRepository;
    @Autowired
    protected ExamRepository examRepository;
    @Autowired
    protected QuestionRepository questionRepository;
    @Autowired
    protected ResourceRuleRepository ruleRepository;
    @Autowired
    protected ExamPermissionRepository permissionRepository;
    @Autowired
    protected CandidateRepository candidateRepository;
    @Autowired
    protected AttemptRepository attemptRepository;
    @Autowired
    protected AnswerRevisionRepository revisionRepository;
    @Autowired
    protected ActivityEventRepository eventRepository;
    @Autowired
    protected AnalysisRunRepository analysisRunRepository;
    @Autowired
    protected FindingRepository findingRepository;
    @Autowired
    protected EvidenceItemRepository evidenceRepository;
    @Autowired
    protected ReviewDecisionRepository decisionRepository;
    @Autowired
    protected AuditLogRepository auditLogRepository;

    protected User staff(Role role) {
        User user = new User();
        user.setEmail(role.name().toLowerCase() + "-" + UUID.randomUUID() + "@test.local");
        user.setDisplayName("Test " + role.name());
        user.setPasswordHash(passwordEncoder.encode("TestPassword123!"));
        user.setRole(role);
        user.setEnabled(true);
        return userRepository.save(user);
    }

    protected String bearer(User user) {
        return "Bearer " + jwtService.issueStaffToken(user);
    }

    protected Exam exam(User owner, String code, ExamStatus status) {
        Exam exam = new Exam();
        exam.setCode(code);
        exam.setTitle("Test exam " + code);
        exam.setDurationMinutes(60);
        exam.setStatus(status);
        exam.setCreatedBy(owner);
        exam = examRepository.save(exam);
        grant(exam, owner, PermissionLevel.OWNER);
        return exam;
    }

    protected void grant(Exam exam, User user, PermissionLevel level) {
        ExamPermission permission = new ExamPermission();
        permission.setExam(exam);
        permission.setUser(user);
        permission.setLevel(level);
        permissionRepository.save(permission);
    }

    protected Question question(Exam exam, int order) {
        Question question = new Question();
        question.setExam(exam);
        question.setOrderIndex(order);
        question.setPrompt("Question " + order + " prompt");
        question.setMaxWords(250);
        return questionRepository.save(question);
    }

    protected Candidate candidate(Exam exam, String code) {
        Candidate candidate = new Candidate();
        candidate.setExam(exam);
        candidate.setCode(code);
        return candidateRepository.save(candidate);
    }

    protected Attempt attempt(Exam exam, Candidate candidate, AttemptStatus status) {
        Instant start = Instant.now().minus(30, ChronoUnit.MINUTES);
        Attempt attempt = new Attempt();
        attempt.setExam(exam);
        attempt.setCandidate(candidate);
        attempt.setStatus(status);
        attempt.setStartedAt(start);
        attempt.setLastSeenAt(start.plus(20, ChronoUnit.MINUTES));
        attempt.setExtensionConnected(true);
        if (status == AttemptStatus.SUBMITTED) {
            attempt.setSubmittedAt(start.plus(20, ChronoUnit.MINUTES));
        }
        return attemptRepository.save(attempt);
    }

    protected AnswerRevision revision(Attempt attempt, Question question, int revisionNo, String text, Instant at) {
        AnswerRevision revision = new AnswerRevision();
        revision.setAttempt(attempt);
        revision.setQuestion(question);
        revision.setRevisionNo(revisionNo);
        revision.setText(text);
        revision.setClientSeq((long) revisionNo);
        revision.setSavedAt(at);
        return revisionRepository.save(revision);
    }

    protected Finding finding(Exam exam, Candidate candidateA, Candidate candidateB, double score) {
        Finding finding = new Finding();
        finding.setExam(exam);
        finding.setAnalysisRun(analysisRunRepository.save(run(exam)));
        finding.setType(candidateB == null ? FindingType.CANDIDATE_INCIDENT : FindingType.CANDIDATE_PAIR);
        finding.setCandidateA(candidateA);
        finding.setCandidateB(candidateB);
        finding.setPriorityScore(score);
        finding.setPriorityBand(PriorityBand.fromScore(score));
        finding.setCoverageWarning(false);
        finding.setStatus(FindingStatus.OPEN);
        finding.setSummary("Synthetic test finding");
        return findingRepository.save(finding);
    }

    private AnalysisRun run(Exam exam) {
        AnalysisRun run = new AnalysisRun();
        run.setExam(exam);
        run.setStatus(AnalysisStatus.COMPLETED);
        run.setModelVersion("test-1.0");
        run.setStartedAt(Instant.now());
        run.setFinishedAt(Instant.now());
        return run;
    }
}
