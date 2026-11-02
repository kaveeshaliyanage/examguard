package com.examguard.admin;

import com.examguard.admin.AdminDtos.CreateUserRequest;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.dto.CommonDtos.UserView;
import com.examguard.repo.UserRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@Service
public class AdminService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AccessService accessService;
    private final AuditService auditService;

    public AdminService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AccessService accessService,
            AuditService auditService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.accessService = accessService;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<UserView> listUsers(Authentication auth) {
        requireAdmin(auth);
        return userRepository.findAllByOrderByDisplayNameAsc().stream().map(this::view).toList();
    }

    @Transactional
    public UserView createUser(Authentication auth, CreateUserRequest request) {
        requireAdmin(auth);
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already exists");
        }
        User user = new User();
        user.setEmail(email);
        user.setDisplayName(request.displayName().trim());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(request.role());
        user.setEnabled(true);
        userRepository.save(user);

        auditService.record(accessService.currentUser(auth), null, "USER_CREATED", "APP_USER", user.getId(),
                Map.of("email", email, "role", request.role().name()));
        return view(user);
    }

    private void requireAdmin(Authentication auth) {
        if (!Role.ADMIN.name().equals(accessService.role(auth))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator required");
        }
    }

    private UserView view(User user) {
        return new UserView(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole());
    }
}
