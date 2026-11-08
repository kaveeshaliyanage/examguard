package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "exam_enrollment", uniqueConstraints = {
        @UniqueConstraint(name = "uk_enrollment_exam_email", columnNames = {"exam_id", "email"})
})
@Getter
@Setter
@NoArgsConstructor
public class ExamEnrollment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    /** Stored trimmed and lower-case so case-insensitive matching is a plain equality lookup. */
    @Column(nullable = false)
    private String email;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (email != null) {
            email = email.trim().toLowerCase();
        }
    }
}
