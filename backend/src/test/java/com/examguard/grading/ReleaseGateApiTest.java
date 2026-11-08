package com.examguard.grading;

import com.examguard.domain.AnswerGrade;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.AnswerGradeRepository;
import com.examguard.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReleaseGateApiTest extends ApiTestBase {

    @Autowired
    private AnswerGradeRepository gradeRepository;

    @Test
    void releaseIsRefusedWhileAnyAnswerIsUnscored() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "REL-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.CLOSED);
        Question auto = objective(exam, 1);
        Question essay = essay(exam, 2);

        Attempt attempt = attempt(exam, candidate(exam, "REL-C1"), AttemptStatus.SUBMITTED);
        revision(attempt, auto, 1, "", Instant.now().minusSeconds(300));
        revision(attempt, essay, 1, "A long written answer.", Instant.now().minusSeconds(300));
        attempt.setScorePoints(new BigDecimal("4.00"));
        attempt.setMaxPoints(new BigDecimal("10.00"));
        attempt.setGradedAt(Instant.now());
        attempt = attemptRepository.save(attempt);

        scored(attempt, auto, "4.00");

        mvc.perform(post("/api/exams/" + exam.getId() + "/grades/release")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "1 attempt still has ungraded answers. Score every answer before releasing."));

        Attempt blocked = attemptRepository.findById(attempt.getId()).orElseThrow();
        assertThat(blocked.getReleasedAt()).isNull();

        scored(attempt, essay, "6.00");

        mvc.perform(post("/api/exams/" + exam.getId() + "/grades/release")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.releasedAttempts").value(1));

        Attempt released = attemptRepository.findById(attempt.getId()).orElseThrow();
        assertThat(released.getReleasedAt()).isNotNull();
    }

    @Test
    void aSecondReleaseDoesNotCountAlreadyReleasedAttempts() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "REL-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.CLOSED);
        Question auto = objective(exam, 1);

        Attempt attempt = attempt(exam, candidate(exam, "REL-C2"), AttemptStatus.SUBMITTED);
        attempt.setScorePoints(new BigDecimal("4.00"));
        attempt.setMaxPoints(new BigDecimal("4.00"));
        attempt.setGradedAt(Instant.now());
        attempt.setReleasedAt(Instant.now().minusSeconds(60));
        attempt = attemptRepository.save(attempt);
        scored(attempt, auto, "4.00");

        mvc.perform(post("/api/exams/" + exam.getId() + "/grades/release")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.releasedAttempts").value(0));
    }

    private Question objective(Exam exam, int order) {
        Question question = question(exam, order);
        question.setType(QuestionType.SINGLE_CHOICE);
        question.setPoints(new BigDecimal("4.00"));
        question.setGradingMode(GradingMode.AUTO);
        question.setContentJson("{\"options\":[{\"key\":\"A\",\"text\":\"One\"},"
                + "{\"key\":\"B\",\"text\":\"Two\"}]}");
        question.setAnswerKeyJson("{\"selectedKeys\":[\"A\"]}");
        return questionRepository.save(question);
    }

    private Question essay(Exam exam, int order) {
        Question question = question(exam, order);
        question.setType(QuestionType.ESSAY);
        question.setPoints(new BigDecimal("6.00"));
        question.setGradingMode(GradingMode.MANUAL);
        return questionRepository.save(question);
    }

    private void scored(Attempt attempt, Question question, String points) {
        AnswerGrade grade = new AnswerGrade();
        grade.setAttempt(attempt);
        grade.setQuestion(question);
        grade.setAwardedPoints(new BigDecimal(points));
        grade.setMaxPoints(question.getPoints());
        grade.setMode(question.getGradingMode());
        grade.setGradedAt(Instant.now());
        gradeRepository.save(grade);
    }
}
