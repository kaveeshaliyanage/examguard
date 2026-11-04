package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "activity_event", uniqueConstraints = {
        @UniqueConstraint(name = "uk_event_attempt_client", columnNames = {"attempt_id", "client_event_id"})
}, indexes = {
        @Index(name = "idx_event_attempt_time", columnList = "attempt_id,occurred_at")
})
@Getter
@Setter
@NoArgsConstructor
public class ActivityEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attempt_id", nullable = false)
    private Attempt attempt;

    @Column(name = "client_event_id", nullable = false)
    private String clientEventId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false)
    private EventType eventType;

    @Column
    private String domain;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Column(name = "tab_id")
    private Integer tabId;

    @Column(name = "metadata_json", columnDefinition = "text")
    private String metadataJson;
}
