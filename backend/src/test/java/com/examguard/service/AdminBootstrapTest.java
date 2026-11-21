package com.examguard.service;

import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminBootstrapTest {

    private UserRepository users;
    private AuditService audit;
    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        audit = mock(AuditService.class);
        when(users.save(any(User.class))).thenAnswer(call -> call.getArgument(0));
    }

    private AdminBootstrap bootstrap(String email, String password) {
        return new AdminBootstrap(users, encoder, audit, email, password, "Ops Admin");
    }

    @Test
    void createsTheFirstAdministratorWithAHashedPassword() {
        when(users.countByRole(Role.ADMIN)).thenReturn(0L);
        when(users.existsByEmailIgnoreCase("ops@uni.example")).thenReturn(false);

        bootstrap("  Ops@Uni.Example ", "a-long-enough-secret").run();

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        User admin = saved.getValue();
        assertThat(admin.getEmail()).isEqualTo("ops@uni.example");
        assertThat(admin.getRole()).isEqualTo(Role.ADMIN);
        assertThat(admin.getDisplayName()).isEqualTo("Ops Admin");
        assertThat(admin.getPasswordHash()).isNotEqualTo("a-long-enough-secret");
        assertThat(encoder.matches("a-long-enough-secret", admin.getPasswordHash())).isTrue();
    }

    @Test
    void doesNothingWithoutAnEmailOrOnceAnAdministratorExists() {
        bootstrap("", "a-long-enough-secret").run();

        when(users.countByRole(Role.ADMIN)).thenReturn(1L);
        bootstrap("ops@uni.example", "short").run();

        verify(users, never()).save(any(User.class));
    }

    @Test
    void refusesAShortPasswordOrAnAddressThatIsAlreadyTaken() {
        when(users.countByRole(Role.ADMIN)).thenReturn(0L);
        assertThatThrownBy(() -> bootstrap("ops@uni.example", "too-short").run())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at least 12");

        when(users.existsByEmailIgnoreCase("student@uni.example")).thenReturn(true);
        assertThatThrownBy(() -> bootstrap("student@uni.example", "a-long-enough-secret").run())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("non-admin");

        verify(users, never()).save(any(User.class));
    }
}
