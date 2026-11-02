package com.examguard.service;

import com.examguard.config.JwtService;
import com.examguard.domain.User;
import com.examguard.dto.AuthDtos.LoginRequest;
import com.examguard.dto.AuthDtos.LoginResponse;
import com.examguard.dto.CommonDtos.UserView;
import com.examguard.repo.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AccessService accessService;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       AccessService accessService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.accessService = accessService;
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByEmailIgnoreCase(request.email().trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        if (!user.isEnabled() || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        return new LoginResponse(jwtService.issueStaffToken(user), toView(user));
    }

    @Transactional(readOnly = true)
    public UserView me(Authentication auth) {
        return toView(accessService.currentUser(auth));
    }

    public UserView toView(User user) {
        return new UserView(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole());
    }
}
