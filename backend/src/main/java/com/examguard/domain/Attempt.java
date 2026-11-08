package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "attempt", uniqueConstraints = {
        @UniqueConstraint(name = "uk_attempt_exam_candidate", columnNames = {"exam_id", "candidate_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class Attempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "candidate_id", nullable = false)
    private Candidate candidate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_user_id")
    private User studentUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AttemptStatus status = AttemptStatus.IN_PROGRESS;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    @Column(name = "extension_connected", nullable = false)
    private boolean extensionConnected;

    @Column(name = "late_submission", nullable = false)
    private boolean lateSubmission;

    @Column(name = "strike_count", nullable = false)
    private Integer strikeCount = 0;

    @Column(name = "max_strikes", nullable = false)
    private Integer maxStrikes;

    @Column(name = "terminated_at")
    private Instant terminatedAt;

    @Column(name = "termination_reason", length = 32)
    private String terminationReason;

    @Column(name = "score_points", precision = 8, scale = 2)
    private BigDecimal scorePoints;

    @Column(name = "max_points", precision = 8, scale = 2)
    private BigDecimal maxPoints;

    @Column(name = "graded_at")
    private Instant gradedAt;

    @Column(name = "released_at")
    private Instant releasedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (startedAt == null) {
            startedAt = Instant.now();
        }
        if (status == null) {
            status = AttemptStatus.IN_PROGRESS;
        }
        if (strikeCount == null) {
            strikeCount = 0;
        }
        if (maxStrikes == null) {
            maxStrikes = exam != null && exam.getMaxStrikes() != null ? exam.getMaxStrikes() : 3;
        }
    }
}
