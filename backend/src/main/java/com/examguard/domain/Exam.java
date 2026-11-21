package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "exam")
@Getter
@Setter
@NoArgsConstructor
public class Exam {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExamStatus status = ExamStatus.DRAFT;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "opens_at")
    private Instant opensAt;

    @Column(name = "closes_at")
    private Instant closesAt;

    @Column(name = "allow_extension", nullable = false)
    private boolean allowExtension = true;

    @Column(name = "max_strikes", nullable = false)
    private Integer maxStrikes = 3;

    @Column(columnDefinition = "text")
    private String instructions;

    @Column(name = "requires_pin", nullable = false)
    private boolean requiresPin;

    @Column(name = "access_pin_hash", length = 100)
    private String accessPinHash;

    @Column(name = "access_pin_issued_at")
    private Instant accessPinIssuedAt;

    @Column(name = "access_pin_sent_at")
    private Instant accessPinSentAt;

    @Column(name = "requires_preflight", nullable = false)
    private boolean requiresPreflight = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (status == null) {
            status = ExamStatus.DRAFT;
        }
        if (maxStrikes == null) {
            maxStrikes = 3;
        }
    }
}
