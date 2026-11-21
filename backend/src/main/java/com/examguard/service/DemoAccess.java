package com.examguard.service;

import com.examguard.domain.Exam;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;

/** Shared access setup for scripted demo exams: one known PIN and the supervised pre-exam window. */
final class DemoAccess {

    static final String PIN = "246810";

    private DemoAccess() {
    }

    static void protect(Exam exam, PasswordEncoder passwordEncoder) {
        exam.setRequiresPin(true);
        exam.setRequiresPreflight(true);
        exam.setAccessPinHash(passwordEncoder.encode(PIN));
        exam.setAccessPinIssuedAt(Instant.now());
    }
}
