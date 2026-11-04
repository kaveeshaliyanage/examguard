package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "finding", indexes = {
        @Index(name = "idx_finding_exam_type_score", columnList = "exam_id,type,priority_score")
})
@Getter
@Setter
@NoArgsConstructor
public class Finding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "analysis_run_id", nullable = false)
    private AnalysisRun analysisRun;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FindingType type;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "candidate_a_id", nullable = false)
    private Candidate candidateA;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "candidate_b_id")
    private Candidate candidateB;

    @Column(name = "question_id")
    private Long questionId;

    @Column(name = "priority_score", nullable = false)
    private double priorityScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority_band", nullable = false)
    private PriorityBand priorityBand;

    @Column(name = "coverage_warning", nullable = false)
    private boolean coverageWarning;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FindingStatus status = FindingStatus.OPEN;

    @Column(columnDefinition = "text")
    private String summary;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (status == null) {
            status = FindingStatus.OPEN;
        }
    }
}
