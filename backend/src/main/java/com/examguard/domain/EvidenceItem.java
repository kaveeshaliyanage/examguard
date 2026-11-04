package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "evidence_item", indexes = {
        @Index(name = "idx_evidence_finding", columnList = "finding_id")
})
@Getter
@Setter
@NoArgsConstructor
public class EvidenceItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "finding_id", nullable = false)
    private Finding finding;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EvidenceSource source;

    @Column(nullable = false)
    private double weight;

    @Column(name = "question_id")
    private Long questionId;

    @Column(columnDefinition = "text")
    private String detail;

    @Column(name = "metadata_json", columnDefinition = "text")
    private String metadataJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
