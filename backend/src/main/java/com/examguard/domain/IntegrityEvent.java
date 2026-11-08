package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "integrity_event", uniqueConstraints = {
        @UniqueConstraint(name = "uk_integrity_attempt_episode", columnNames = {"attempt_id", "episode_key"})
}, indexes = {
        @Index(name = "idx_integrity_attempt_time", columnList = "attempt_id,occurred_at")
})
@Getter
@Setter
@NoArgsConstructor
public class IntegrityEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attempt_id", nullable = false)
    private Attempt attempt;

    @Column(name = "episode_key", nullable = false, length = 100)
    private String episodeKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "signal_type", nullable = false, length = 32)
    private IntegritySignal signal;

    @Column(name = "strike_index")
    private Integer strikeIndex;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Column(name = "client_seq")
    private Long clientSeq;

    @Column(name = "metadata_json", columnDefinition = "text")
    private String metadataJson;
}
