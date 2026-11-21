package com.examguard.service;

import com.examguard.domain.Attempt;
import com.examguard.domain.ExamPermission;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.User;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.ExamPermissionRepository;
import com.examguard.repo.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccessService {

    public static final String SCOPE_ATTEMPT = "ATTEMPT";
    public static final String SCOPE_ACCOUNT = "ACCOUNT";

    private final UserRepository userRepository;
    private final ExamPermissionRepository permissionRepository;
    private final AttemptRepository attemptRepository;

    public AccessService(UserRepository userRepository,
                         ExamPermissionRepository permissionRepository,
                         AttemptRepository attemptRepository) {
        this.userRepository = userRepository;
        this.permissionRepository = permissionRepository;
        this.attemptRepository = attemptRepository;
    }

    public String role(Authentication auth) {
        requireAuthentication(auth);
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith("ROLE_"))
                .map(authority -> authority.substring(5))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required"));
    }

    /** Account and attempt tokens both carry role STUDENT; the scope claim tells them apart. */
    public String scope(Authentication auth) {
        requireAuthentication(auth);
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith("SCOPE_"))
                .map(authority -> authority.substring(6))
                .findFirst()
                .orElse(null);
    }

    public boolean isStaff(Authentication auth) {
        String role = role(auth);
        return "ADMIN".equals(role) || "LECTURER".equals(role) || "REVIEWER".equals(role);
    }

    public Long actorId(Authentication auth) {
        try {
            return Long.valueOf(auth.getName());
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid principal");
        }
    }

    public void requireStaff(Authentication auth) {
        if (!isStaff(auth)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Staff account required");
        }
    }

    public void requireExamView(Authentication auth, Long examId) {
        String role = role(auth);
        if ("ADMIN".equals(role) || "REVIEWER".equals(role)) {
            return;
        }
        if ("LECTURER".equals(role)
                && permissionRepository.existsByExamIdAndUserId(examId, actorId(auth))) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No access to this exam");
    }

    public void requireExamOwner(Authentication auth, Long examId) {
        String role = role(auth);
        if ("ADMIN".equals(role)) {
            return;
        }
        if ("LECTURER".equals(role)
                && permissionRepository.existsByExamIdAndUserIdAndLevel(
                examId, actorId(auth), PermissionLevel.OWNER)) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Exam owner permission required");
    }

    /** Deciding a finding requires review rights, not merely read access. */
    public void requireExamReview(Authentication auth, Long examId) {
        String role = role(auth);
        if ("ADMIN".equals(role) || "REVIEWER".equals(role)) {
            return;
        }
        if ("LECTURER".equals(role)
                && (permissionRepository.existsByExamIdAndUserIdAndLevel(
                examId, actorId(auth), PermissionLevel.OWNER)
                || permissionRepository.existsByExamIdAndUserIdAndLevel(
                examId, actorId(auth), PermissionLevel.REVIEWER))) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Review permission required");
    }

    public Attempt requireAttemptOwner(Authentication auth, Long attemptId) {
        Attempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attempt not found"));
        return requireAttemptOwner(auth, attempt);
    }

    public Attempt requireAttemptOwner(Authentication auth, Attempt attempt) {
        if (!ownsAttempt(auth, attempt)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This token does not own the attempt");
        }
        return attempt;
    }

    public boolean isAdmin(Authentication auth) {
        return "ADMIN".equals(role(auth));
    }

    public boolean isReviewer(Authentication auth) {
        return "REVIEWER".equals(role(auth));
    }

    public Attempt requireAttemptAccess(Authentication auth, Long attemptId) {
        Attempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attempt not found"));

        if ("STUDENT".equals(role(auth))) {
            if (ownsAttempt(auth, attempt)) {
                return attempt;
            }
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not this attempt");
        }
        requireExamView(auth, attempt.getExam().getId());
        return attempt;
    }

    public User requireStudentAccount(Authentication auth) {
        if (!"STUDENT".equals(role(auth)) || !SCOPE_ACCOUNT.equals(scope(auth))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Student account token required");
        }
        return userRepository.findById(actorId(auth))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    public User currentUser(Authentication auth) {
        requireStaff(auth);
        return userRepository.findById(actorId(auth))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    public ExamPermission permission(Long examId, Long userId) {
        return permissionRepository.findByExamIdAndUserId(examId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "No permission"));
    }

    private boolean ownsAttempt(Authentication auth, Attempt attempt) {
        if (!"STUDENT".equals(role(auth))) {
            return false;
        }
        String scope = scope(auth);
        if (SCOPE_ATTEMPT.equals(scope)) {
            return String.valueOf(attempt.getId()).equals(auth.getName());
        }
        if (SCOPE_ACCOUNT.equals(scope)) {
            return attempt.getStudentUser() != null
                    && String.valueOf(attempt.getStudentUser().getId()).equals(auth.getName());
        }
        return false;
    }

    private void requireAuthentication(Authentication auth) {
        if (auth == null || !auth.isAuthenticated() || auth.getAuthorities().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
    }
}
