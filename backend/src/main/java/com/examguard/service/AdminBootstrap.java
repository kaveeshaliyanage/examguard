package com.examguard.service;

import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Map;

/**
 * Creates the first administrator on an empty production database, where demo seeding is off and
 * nobody could otherwise sign in to create accounts. It runs only while no ADMIN exists, so the
 * bootstrap credentials stop mattering once that account is used; rotate its password in the UI
 * and clear the variables afterwards.
 */
@Component
public class AdminBootstrap implements CommandLineRunner {

    static final int MIN_PASSWORD_LENGTH = 12;

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;
    private final String email;
    private final String password;
    private final String displayName;

    public AdminBootstrap(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuditService auditService,
            @Value("${app.bootstrap-admin.email:}") String email,
            @Value("${app.bootstrap-admin.password:}") String password,
            @Value("${app.bootstrap-admin.display-name:Administrator}") String displayName) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditService = auditService;
        this.email = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        this.password = password == null ? "" : password;
        this.displayName = displayName == null || displayName.isBlank() ? "Administrator" : displayName.trim();
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (email.isEmpty()) {
            return;
        }
        if (userRepository.countByRole(Role.ADMIN) > 0) {
            log.info("An administrator already exists; BOOTSTRAP_ADMIN_* is ignored and can be removed");
            return;
        }
        if (!email.contains("@")) {
            throw new IllegalStateException("BOOTSTRAP_ADMIN_EMAIL is not an email address");
        }
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalStateException(
                    "BOOTSTRAP_ADMIN_PASSWORD must be at least " + MIN_PASSWORD_LENGTH + " characters");
        }
        if (userRepository.existsByEmailIgnoreCase(email)) {
            // Never silently promote an existing account: that would let anyone who registered
            // the address as a student become an administrator.
            throw new IllegalStateException(
                    "BOOTSTRAP_ADMIN_EMAIL already belongs to a non-admin account; choose another address");
        }

        User admin = new User();
        admin.setEmail(email);
        admin.setDisplayName(displayName);
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setRole(Role.ADMIN);
        admin.setEnabled(true);
        userRepository.save(admin);

        auditService.record(null, null, "ADMIN_BOOTSTRAPPED", "APP_USER", admin.getId(), Map.of("email", email));
        log.info("Created the bootstrap administrator {}", email);
    }
}
