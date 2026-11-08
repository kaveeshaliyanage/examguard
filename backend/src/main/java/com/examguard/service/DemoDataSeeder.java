package com.examguard.service;

import com.examguard.domain.AuditLog;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.AuditLogRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Creates a self-contained demonstration cohort so the analysis service and dashboard can be
 * exercised without setting up data by hand. Scenarios are scripted and must never be treated as
 * evidence of real misconduct.
 *
 * <p>Seeding is resumable: users and exams are created only when missing, so restarting after a
 * release that adds a demo exam does not duplicate the existing cohort.
 */
@Component
public class DemoDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    private final UserRepository userRepository;
    private final ExamRepository examRepository;
    private final AuditLogRepository auditRepository;
    private final PasswordEncoder passwordEncoder;
    private final DemoExamSeeder examSeeder;
    private final DemoAttemptSeeder attemptSeeder;
    private final DemoTypedExamSeeder typedExamSeeder;
    private final DemoCodeExamSeeder codeExamSeeder;
    private final boolean enabled;

    public DemoDataSeeder(
            UserRepository userRepository,
            ExamRepository examRepository,
            AuditLogRepository auditRepository,
            PasswordEncoder passwordEncoder,
            DemoExamSeeder examSeeder,
            DemoAttemptSeeder attemptSeeder,
            DemoTypedExamSeeder typedExamSeeder,
            DemoCodeExamSeeder codeExamSeeder,
            @Value("${app.seed-demo-data:true}") boolean enabled) {
        this.userRepository = userRepository;
        this.examRepository = examRepository;
        this.auditRepository = auditRepository;
        this.passwordEncoder = passwordEncoder;
        this.examSeeder = examSeeder;
        this.attemptSeeder = attemptSeeder;
        this.typedExamSeeder = typedExamSeeder;
        this.codeExamSeeder = codeExamSeeder;
        this.enabled = enabled;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!enabled) {
            return;
        }

        User admin = ensureUser("admin@examguard.local", "Admin123!", "Demo Administrator", Role.ADMIN);
        User lecturer = ensureUser("lecturer@examguard.local", "Lecturer123!", "Demo Lecturer", Role.LECTURER);
        User reviewer = ensureUser("reviewer@examguard.local", "Reviewer123!", "Demo Reviewer", Role.REVIEWER);
        User student = ensureUser("student@examguard.local", "Student123!", "Demo Student", Role.STUDENT);

        if (examRepository.findByCodeIgnoreCase(DemoExamSeeder.EXAM_CODE).isEmpty()) {
            seedReviewExam(admin, lecturer, reviewer);
        }
        if (examRepository.findByCodeIgnoreCase(DemoTypedExamSeeder.EXAM_CODE).isEmpty()) {
            seedTypedExam(admin, lecturer, reviewer, student);
        }
        if (examRepository.findByCodeIgnoreCase(DemoCodeExamSeeder.EXAM_CODE).isEmpty()) {
            seedCodeExam(admin, lecturer, reviewer);
        }
    }

    private void seedReviewExam(User admin, User lecturer, User reviewer) {
        DemoExamSeeder.SeededExam seeded = examSeeder.seed(lecturer, reviewer);

        Instant start = Instant.now().minus(65, ChronoUnit.MINUTES);
        Instant submit = Instant.now().minus(5, ChronoUnit.MINUTES);
        attemptSeeder.seed(seeded, start, submit);

        audit(admin, seeded.exam().getId(), "DEMO_DATA_SEEDED",
                "{\"candidateCodes\":[\"C001\",\"C002\",\"C003\",\"C004\",\"C005\",\"C006\",\"C007\",\"C008\"],\"note\":\"scripted demo scenarios\"}");

        log.info("Seeded demo exam {} with 8 submitted attempts. Staff login: lecturer@examguard.local / Lecturer123!",
                seeded.exam().getCode());
    }

    private void seedTypedExam(User admin, User lecturer, User reviewer, User student) {
        DemoTypedExamSeeder.SeededTypedExam typed = typedExamSeeder.seed(lecturer, reviewer);
        typedExamSeeder.attachStudent(typed.released(), student);

        audit(admin, typed.exam().getId(), "DEMO_TYPED_EXAM_SEEDED",
                "{\"candidateCodes\":[\"C101\",\"C102\"],\"note\":\"scripted typed scenarios\"}");

        log.info("Seeded demo exam {} with five question types. Student login: student@examguard.local / Student123!",
                typed.exam().getCode());
    }

    private void seedCodeExam(User admin, User lecturer, User reviewer) {
        DemoCodeExamSeeder.SeededCodeExam coded = codeExamSeeder.seed(lecturer, reviewer);

        audit(admin, coded.exam().getId(), "DEMO_CODE_EXAM_SEEDED",
                "{\"candidateCodes\":[\"C201\",\"C202\"],\"note\":\"scripted coding scenarios\"}");

        log.info("Seeded demo exam {} with three coding questions. The enrolled student can join it from the dashboard.",
                coded.exam().getCode());
    }

    private void audit(User admin, Long examId, String action, String detailJson) {
        AuditLog audit = new AuditLog();
        audit.setActor(admin);
        audit.setExamId(examId);
        audit.setAction(action);
        audit.setEntityType("EXAM");
        audit.setEntityId(examId);
        audit.setDetailJson(detailJson);
        auditRepository.save(audit);
    }

    private User ensureUser(String email, String password, String name, Role role) {
        return userRepository.findByEmailIgnoreCase(email)
                .orElseGet(() -> createUser(email, password, name, role));
    }

    private User createUser(String email, String password, String name, Role role) {
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setDisplayName(name);
        user.setRole(role);
        user.setEnabled(true);
        return userRepository.save(user);
    }
}
