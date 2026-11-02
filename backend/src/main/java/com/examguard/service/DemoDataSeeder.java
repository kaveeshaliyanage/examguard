package com.examguard.service;

import com.examguard.domain.AuditLog;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.AuditLogRepository;
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
 */
@Component
public class DemoDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    private final UserRepository userRepository;
    private final AuditLogRepository auditRepository;
    private final PasswordEncoder passwordEncoder;
    private final DemoExamSeeder examSeeder;
    private final DemoAttemptSeeder attemptSeeder;
    private final boolean enabled;

    public DemoDataSeeder(
            UserRepository userRepository,
            AuditLogRepository auditRepository,
            PasswordEncoder passwordEncoder,
            DemoExamSeeder examSeeder,
            DemoAttemptSeeder attemptSeeder,
            @Value("${app.seed-demo-data:true}") boolean enabled) {
        this.userRepository = userRepository;
        this.auditRepository = auditRepository;
        this.passwordEncoder = passwordEncoder;
        this.examSeeder = examSeeder;
        this.attemptSeeder = attemptSeeder;
        this.enabled = enabled;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!enabled || userRepository.count() > 0) {
            return;
        }

        User admin = createUser("admin@examguard.local", "Admin123!", "Demo Administrator", Role.ADMIN);
        User lecturer = createUser("lecturer@examguard.local", "Lecturer123!", "Demo Lecturer", Role.LECTURER);
        User reviewer = createUser("reviewer@examguard.local", "Reviewer123!", "Demo Reviewer", Role.REVIEWER);

        DemoExamSeeder.SeededExam seeded = examSeeder.seed(lecturer, reviewer);

        Instant start = Instant.now().minus(65, ChronoUnit.MINUTES);
        Instant submit = Instant.now().minus(5, ChronoUnit.MINUTES);
        attemptSeeder.seed(seeded, start, submit);

        AuditLog audit = new AuditLog();
        audit.setActor(admin);
        audit.setExamId(seeded.exam().getId());
        audit.setAction("DEMO_DATA_SEEDED");
        audit.setEntityType("EXAM");
        audit.setEntityId(seeded.exam().getId());
        audit.setDetailJson("{\"candidateCodes\":[\"C001\",\"C002\",\"C003\",\"C004\",\"C005\",\"C006\",\"C007\",\"C008\"],\"note\":\"scripted demo scenarios\"}");
        auditRepository.save(audit);

        log.info("Seeded demo exam {} with {} submitted attempts. Staff login: lecturer@examguard.local / Lecturer123!",
                seeded.exam().getCode(), 8);
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
