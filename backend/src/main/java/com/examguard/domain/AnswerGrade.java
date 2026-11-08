package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "answer_grade", uniqueConstraints = {
        @UniqueConstraint(name = "uk_grade_attempt_question", columnNames = {"attempt_id", "question_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class AnswerGrade {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attempt_id", nullable = false)
    private Attempt attempt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Column(name = "awarded_points", nullable = false, precision = 8, scale = 2)
    private BigDecimal awardedPoints;

    @Column(name = "max_points", nullable = false, precision = 8, scale = 2)
    private BigDecimal maxPoints;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private GradingMode mode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "graded_by")
    private User gradedBy;

    @Column(columnDefinition = "text")
    private String comment;

    @Column(name = "graded_at", nullable = false)
    private Instant gradedAt;
}
