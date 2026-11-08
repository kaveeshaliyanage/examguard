package com.examguard.config;

import com.examguard.domain.Attempt;
import com.examguard.domain.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

@Service
public class JwtService {

    private final SecretKey key;
    private final long staffTtlMinutes;
    private final long attemptTtlMinutes;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.staff-ttl-minutes:480}") long staffTtlMinutes,
            @Value("${app.jwt.attempt-ttl-minutes:360}") long attemptTtlMinutes) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("app.jwt.secret must be at least 32 bytes (256 bits)");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.staffTtlMinutes = staffTtlMinutes;
        this.attemptTtlMinutes = attemptTtlMinutes;
    }

    public String issueStaffToken(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claim("role", user.getRole().name())
                .claim("name", user.getDisplayName())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(staffTtlMinutes, ChronoUnit.MINUTES)))
                .signWith(key)
                .compact();
    }

    public String issueAttemptToken(Attempt attempt) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(attempt.getId()))
                .claim("role", "STUDENT")
                .claim("scope", "ATTEMPT")
                .claim("attemptId", attempt.getId())
                .claim("examId", attempt.getExam().getId())
                .claim("candidateCode", attempt.getCandidate().getCode())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(attemptTtlMinutes, ChronoUnit.MINUTES)))
                .signWith(key)
                .compact();
    }

    public String issueStudentToken(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claim("role", "STUDENT")
                .claim("scope", "ACCOUNT")
                .claim("name", user.getDisplayName())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(staffTtlMinutes, ChronoUnit.MINUTES)))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
