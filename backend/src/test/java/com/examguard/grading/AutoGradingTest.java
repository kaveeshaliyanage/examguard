package com.examguard.grading;

import com.examguard.domain.AnswerGrade;
import com.examguard.domain.AnswerRevision;
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
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
class AutoGradingTest extends ApiTestBase {

    @Autowired
    private GradingService gradingService;
    @Autowired
    private AnswerGradeRepository gradeRepository;

    @Test
    void singleChoiceIsAllOrNothing() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        Question question = choice(exam, 1, QuestionType.SINGLE_CHOICE, "4.00", "A", "A", "B", "C");

        Attempt correct = answered(exam, "AG-1", question, "[\"A\"]");
        Attempt wrong = answered(exam, "AG-2", question, "[\"B\"]");
        Attempt empty = answered(exam, "AG-3", question, null);

        gradingService.autoGrade(correct);
        gradingService.autoGrade(wrong);
        gradingService.autoGrade(empty);

        assertThat(awarded(correct, question)).isEqualByComparingTo("4.00");
        assertThat(awarded(wrong, question)).isEqualByComparingTo("0.00");
        assertThat(awarded(empty, question)).isEqualByComparingTo("0.00");

        Attempt graded = attemptRepository.findById(correct.getId()).orElseThrow();
        assertThat(graded.getScorePoints()).isEqualByComparingTo("4.00");
        assertThat(graded.getMaxPoints()).isEqualByComparingTo("4.00");
        assertThat(graded.getGradedAt()).isNotNull();
    }

    @Test
    void multiChoiceGivesProportionalCredit() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        Question question = choice(exam, 1, QuestionType.MULTI_CHOICE, "6.00", "A,B,C",
                "A", "B", "C", "D", "E");

        Attempt partial = answered(exam, "AG-4", question, "[\"A\",\"B\",\"D\"]");
        Attempt full = answered(exam, "AG-5", question, "[\"C\",\"A\",\"B\"]");

        gradingService.autoGrade(partial);
        gradingService.autoGrade(full);

        assertThat(awarded(partial, question)).isEqualByComparingTo("2.00");
        assertThat(awarded(full, question)).isEqualByComparingTo("6.00");
    }

    @Test
    void multiChoiceNeverGoesBelowZero() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, uniqueCode(), ExamStatus.OPEN);
        Question question = choice(exam, 1, QuestionType.MULTI_CHOICE, "6.00", "A,B,C",
                "A", "B", "C", "D", "E");

        Attempt guessing = answered(exam, "AG-6", question, "[\"D\",\"E\"]");

        gradingService.autoGrade(guessing);

        assertThat(awarded(guessing, question)).isEqualByComparingTo("0.00");
        Attempt graded = attemptRepository.findById(guessing.getId()).orElseThrow();
        assertThat(graded.getScorePoints()).isEqualByComparingTo("0.00");
    }

    private BigDecimal awarded(Attempt attempt, Question question) {
        AnswerGrade grade = gradeRepository
                .findByAttemptIdAndQuestionId(attempt.getId(), question.getId())
                .orElseThrow();
        assertThat(grade.getMode()).isEqualTo(GradingMode.AUTO);
        return grade.getAwardedPoints();
    }

    private Question choice(Exam exam, int order, QuestionType type, String points, String key,
                            String... options) {
        Question question = new Question();
        question.setExam(exam);
        question.setOrderIndex(order);
        question.setPrompt("Objective question " + order);
        question.setMaxWords(0);
        question.setType(type);
        question.setPoints(new BigDecimal(points));
        question.setGradingMode(GradingMode.AUTO);
        question.setContentJson(contentJson(options));
        question.setAnswerKeyJson("{\"selectedKeys\":[" + quoted(key.split(",")) + "]}");
        return questionRepository.save(question);
    }

    private String contentJson(String... options) {
        StringBuilder builder = new StringBuilder("{\"options\":[");
        for (int index = 0; index < options.length; index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append("{\"key\":\"").append(options[index])
                    .append("\",\"text\":\"Option ").append(options[index]).append("\"}");
        }
        return builder.append("]}").toString();
    }

    private String quoted(String[] keys) {
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < keys.length; index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append('"').append(keys[index].trim()).append('"');
        }
        return builder.toString();
    }

    private Attempt answered(Exam exam, String candidateCode, Question question, String selectedJson) {
        Attempt attempt = attempt(exam, candidate(exam, candidateCode), AttemptStatus.IN_PROGRESS);
        AnswerRevision revision = new AnswerRevision();
        revision.setAttempt(attempt);
        revision.setQuestion(question);
        revision.setRevisionNo(1);
        revision.setText("");
        revision.setSelectedOptions(selectedJson);
        revision.setClientSeq(1L);
        revision.setSavedAt(Instant.now());
        revisionRepository.save(revision);
        return attempt;
    }

    private String uniqueCode() {
        return "AG-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
}
