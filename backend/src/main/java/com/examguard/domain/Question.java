package com.examguard.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Entity
@Table(name = "question", uniqueConstraints = {
        @UniqueConstraint(name = "uk_question_exam_order", columnNames = {"exam_id", "order_index"})
})
@Getter
@Setter
@NoArgsConstructor
public class Question {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    @Column(name = "order_index", nullable = false)
    private Integer orderIndex;

    @Column(nullable = false, columnDefinition = "text")
    private String prompt;

    @Column(name = "max_words", nullable = false)
    private Integer maxWords;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private QuestionType type = QuestionType.ESSAY;

    @Column(nullable = false, precision = 6, scale = 2)
    private BigDecimal points = new BigDecimal("1.00");

    @Enumerated(EnumType.STRING)
    @Column(name = "grading_mode", nullable = false, length = 16)
    private GradingMode gradingMode = GradingMode.MANUAL;

    @Column(name = "content_json", nullable = false, columnDefinition = "text")
    private String contentJson = "{}";

    @Column(name = "answer_key_json", columnDefinition = "text")
    private String answerKeyJson;

    @Column(columnDefinition = "text")
    private String explanation;

    @PrePersist
    void onCreate() {
        if (type == null) {
            type = QuestionType.ESSAY;
        }
        if (points == null) {
            points = new BigDecimal("1.00");
        }
        if (gradingMode == null) {
            gradingMode = GradingMode.MANUAL;
        }
        if (contentJson == null) {
            contentJson = "{}";
        }
        if (maxWords == null) {
            maxWords = type == QuestionType.SHORT_ANSWER || type == QuestionType.ESSAY ? 500 : 0;
        }
    }
}
