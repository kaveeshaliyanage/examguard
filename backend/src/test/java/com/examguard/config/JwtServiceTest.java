package com.examguard.config;

import com.examguard.domain.Attempt;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final String SECRET = "test-only-secret-0123456789abcdef-0123456789";

    private final JwtService service = new JwtService(SECRET, 60, 60);

    @Test
    void staffTokenCarriesRoleAndDisplayName() {
        User user = new User();
        ReflectionTestUtils.setField(user, "id", 42L);
        user.setEmail("lecturer@example.test");
        user.setDisplayName("Demo Lecturer");
        user.setRole(Role.LECTURER);

        Claims claims = service.parse(service.issueStaffToken(user));

        assertThat(claims.getSubject()).isEqualTo("42");
        assertThat(claims.get("role", String.class)).isEqualTo("LECTURER");
        assertThat(claims.get("name", String.class)).isEqualTo("Demo Lecturer");
        assertThat(claims.getExpiration()).isAfter(claims.getIssuedAt());
    }

    @Test
    void attemptTokenIsScopedToTheAttemptAndExam() {
        Exam exam = new Exam();
        ReflectionTestUtils.setField(exam, "id", 7L);
        Candidate candidate = new Candidate();
        candidate.setCode("C004");
        Attempt attempt = new Attempt();
        ReflectionTestUtils.setField(attempt, "id", 99L);
        attempt.setExam(exam);
        attempt.setCandidate(candidate);

        Claims claims = service.parse(service.issueAttemptToken(attempt));

        assertThat(claims.getSubject()).isEqualTo("99");
        assertThat(claims.get("role", String.class)).isEqualTo("STUDENT");
        assertThat(claims.get("attemptId", Number.class).longValue()).isEqualTo(99L);
        assertThat(claims.get("examId", Number.class).longValue()).isEqualTo(7L);
        assertThat(claims.get("candidateCode", String.class)).isEqualTo("C004");
    }

    @Test
    void rejectsASecretShorterThan256Bits() {
        assertThatThrownBy(() -> new JwtService("too-short", 60, 60))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bytes");
    }

    @Test
    void rejectsATamperedToken() {
        User user = new User();
        ReflectionTestUtils.setField(user, "id", 1L);
        user.setDisplayName("Admin");
        user.setRole(Role.ADMIN);

        String token = service.issueStaffToken(user);
        String tampered = token.substring(0, token.length() - 2) + "xx";

        assertThatThrownBy(() -> service.parse(tampered))
                .isInstanceOf(Exception.class);
    }
}
