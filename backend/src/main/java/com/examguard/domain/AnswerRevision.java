package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "answer_revision", uniqueConstraints = {
        @UniqueConstraint(name = "uk_revision_attempt_question_no",
                columnNames = {"attempt_id", "question_id", "revision_no"})
}, indexes = {
        @Index(name = "idx_revision_attempt_question", columnList = "attempt_id,question_id")
})
@Getter
@Setter
@NoArgsConstructor
public class AnswerRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attempt_id", nullable = false)
    private Attempt attempt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Column(name = "revision_no", nullable = false)
    private Integer revisionNo;

    @Column(columnDefinition = "text")
    private String text;

    @Column(name = "selected_options", columnDefinition = "text")
    private String selectedOptions;

    @Column(name = "client_seq", nullable = false)
    private Long clientSeq;

    @Column(name = "saved_at", nullable = false)
    private Instant savedAt;
}
