package com.examguard.student;

import com.examguard.attempt.AttemptDtos.JoinRequest;
import com.examguard.attempt.AttemptDtos.JoinResponse;
import com.examguard.attempt.JoinService;
import com.examguard.config.JwtService;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.UserRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import com.examguard.student.StudentDtos.AuthResponse;
import com.examguard.student.StudentDtos.LoginRequest;
import com.examguard.student.StudentDtos.RegisterRequest;
import com.examguard.student.StudentDtos.StudentAttemptSummary;
import com.examguard.student.StudentDtos.StudentProfile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class StudentService {

    private final UserRepository userRepository;
    private final AttemptRepository attemptRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AccessService accessService;
    private final JoinService joinService;
    private final LoginThrottle loginThrottle;
    private final AuditService auditService;

    public StudentService(
            UserRepository userRepository,
            AttemptRepository attemptRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AccessService accessService,
            JoinService joinService,
            LoginThrottle loginThrottle,
            AuditService auditService) {
        this.userRepository = userRepository;
        this.attemptRepository = attemptRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.accessService = accessService;
        this.joinService = joinService;
        this.loginThrottle = loginThrottle;
        this.auditService = auditService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This email is already registered");
        }
        User user = new User();
        user.setEmail(email);
        user.setDisplayName(request.displayName().trim());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(Role.STUDENT);
        user.setEnabled(true);
        try {
            user = userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This email is already registered");
        }

        auditService.record(user, null, "STUDENT_REGISTERED", "USER", user.getId(), Map.of("email", email));
        return new AuthResponse(jwtService.issueStudentToken(user), profile(user));
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request, String client) {
        loginThrottle.check(client);
        User user = userRepository.findByEmailIgnoreCase(request.email().trim()).orElse(null);
        if (user == null
                || user.getRole() != Role.STUDENT
                || !user.isEnabled()
                || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            loginThrottle.recordFailure(client);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        loginThrottle.clear(client);
        return new AuthResponse(jwtService.issueStudentToken(user), profile(user));
    }

    @Transactional(readOnly = true)
    public StudentProfile me(Authentication auth) {
        return profile(accessService.requireStudentAccount(auth));
    }

    @Transactional
    public JoinResponse join(Authentication auth, JoinRequest request, String client) {
        User user = accessService.requireStudentAccount(auth);
        return joinService.join(request, user, client);
    }

    @Transactional(readOnly = true)
    public List<StudentAttemptSummary> attempts(Authentication auth) {
        User user = accessService.requireStudentAccount(auth);
        return attemptRepository.findByStudentUserIdOrderByStartedAtDesc(user.getId()).stream()
                .map(attempt -> new StudentAttemptSummary(
                        attempt.getId(),
                        attempt.getExam().getCode(),
                        attempt.getExam().getTitle(),
                        attempt.getStatus(),
                        attempt.getStartedAt(),
                        attempt.getSubmittedAt(),
                        attempt.getScorePoints(),
                        attempt.getMaxPoints(),
                        attempt.getReleasedAt() != null,
                        attempt.getStrikeCount() == null ? 0 : attempt.getStrikeCount()))
                .toList();
    }

    private StudentProfile profile(User user) {
        return new StudentProfile(user.getId(), user.getEmail(), user.getDisplayName());
    }
}
