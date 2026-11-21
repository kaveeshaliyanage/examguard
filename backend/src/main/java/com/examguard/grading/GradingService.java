package com.examguard.grading;

import com.examguard.attempt.AnswerJson;
import com.examguard.domain.AnswerGrade;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.GradingMode;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.exam.QuestionJson;
import com.examguard.exam.QuestionPayloads.AnswerKey;
import com.examguard.grading.GradingDtos.GradeRequest;
import com.examguard.grading.GradingDtos.GradeResponse;
import com.examguard.grading.GradingDtos.GradingRow;
import com.examguard.grading.GradingDtos.ReleaseResponse;
import com.examguard.judge.CodeGradeDetails;
import com.examguard.repo.AnswerGradeRepository;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
public class GradingService {

    private static final BigDecimal ZERO = new BigDecimal("0.00");

    private final AttemptRepository attemptRepository;
    private final QuestionRepository questionRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final AnswerGradeRepository gradeRepository;
    private final QuestionJson questionJson;
    private final AnswerJson answerJson;
    private final AccessService accessService;
    private final AuditService auditService;
    private final CodeGradeDetails codeGradeDetails;

    public GradingService(
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository,
            AnswerRevisionRepository revisionRepository,
            AnswerGradeRepository gradeRepository,
            QuestionJson questionJson,
            AnswerJson answerJson,
            AccessService accessService,
            AuditService auditService,
            CodeGradeDetails codeGradeDetails) {
        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
        this.revisionRepository = revisionRepository;
        this.gradeRepository = gradeRepository;
        this.questionJson = questionJson;
        this.answerJson = answerJson;
        this.accessService = accessService;
        this.auditService = auditService;
        this.codeGradeDetails = codeGradeDetails;
    }

    @Transactional
    public void autoGrade(Attempt attempt) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        List<Question> questions = questionRepository
                .findByExamIdOrderByOrderIndexAsc(attempt.getExam().getId());

        for (Question question : questions) {
            if (!isAutoGraded(question.getType())) {
                continue;
            }
            AnswerGrade grade = gradeRepository
                    .findByAttemptIdAndQuestionId(attempt.getId(), question.getId())
                    .orElse(null);
            if (grade != null && grade.getMode() == GradingMode.MANUAL) {
                continue;
            }
            if (grade == null) {
                grade = new AnswerGrade();
                grade.setAttempt(attempt);
                grade.setQuestion(question);
            }
            Set<String> selected = revisionRepository
                    .findFirstByAttemptIdAndQuestionIdOrderByRevisionNoDesc(attempt.getId(), question.getId())
                    .map(AnswerRevision::getSelectedOptions)
                    .map(answerJson::asSet)
                    .orElse(Set.of());

            grade.setAwardedPoints(score(question, selected));
            grade.setMaxPoints(scale(question.getPoints()));
            grade.setMode(GradingMode.AUTO);
            grade.setGradedAt(now);
            gradeRepository.save(grade);
        }
        recomputeTotals(attempt, now);
    }

    @Transactional(readOnly = true)
    public List<GradingRow> gradingRows(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(examId);
        List<GradingRow> rows = new ArrayList<>();
        for (Attempt attempt : attemptRepository.findByExamIdOrderByStartedAtAsc(examId)) {
            if (attempt.getStatus() == AttemptStatus.IN_PROGRESS) {
                continue;
            }
            Map<Long, AnswerGrade> grades = new java.util.HashMap<>();
            for (AnswerGrade grade : gradeRepository.findByAttemptId(attempt.getId())) {
                grades.put(grade.getQuestion().getId(), grade);
            }
            for (Question question : questions) {
                AnswerRevision revision = revisionRepository
                        .findFirstByAttemptIdAndQuestionIdOrderByRevisionNoDesc(attempt.getId(), question.getId())
                        .orElse(null);
                AnswerGrade grade = grades.get(question.getId());
                rows.add(new GradingRow(
                        attempt.getId(),
                        attempt.getCandidate().getCode(),
                        question.getId(),
                        question.getPrompt(),
                        question.getType(),
                        scale(question.getPoints()),
                        revision == null ? "" : revision.getText(),
                        revision == null ? List.of() : answerJson.read(revision.getSelectedOptions()),
                        revision == null ? 0 : revision.getRevisionNo(),
                        revision == null ? null : revision.getSavedAt(),
                        questionJson.answerKeyNode(question),
                        question.getExplanation(),
                        grade == null ? null : grade.getAwardedPoints(),
                        grade == null ? null : grade.getComment(),
                        grade == null ? null : codeGradeDetails.parse(grade.getDetailJson())));
            }
        }
        return rows;
    }

    @Transactional
    public GradeResponse grade(Authentication auth, Long attemptId, Long questionId, GradeRequest request) {
        Attempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attempt not found"));
        accessService.requireExamReview(auth, attempt.getExam().getId());
        Question question = questionRepository.findByIdAndExamId(questionId, attempt.getExam().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));

        BigDecimal max = scale(question.getPoints());
        BigDecimal awarded = scale(request.awardedPoints());
        if (awarded.signum() < 0 || awarded.compareTo(max) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "awardedPoints must be between 0 and " + max);
        }

        AnswerGrade grade = gradeRepository.findByAttemptIdAndQuestionId(attemptId, questionId)
                .orElseGet(AnswerGrade::new);
        if (grade.getId() == null) {
            grade.setAttempt(attempt);
            grade.setQuestion(question);
        }
        grade.setAwardedPoints(awarded);
        grade.setMaxPoints(max);
        grade.setMode(GradingMode.MANUAL);
        grade.setGradedBy(accessService.currentUser(auth));
        grade.setComment(request.comment());
        grade.setGradedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
        gradeRepository.save(grade);

        recomputeTotals(attempt, null);
        auditService.record(accessService.currentUser(auth), attempt.getExam().getId(), "ANSWER_GRADED",
                "ANSWER_GRADE", grade.getId(),
                Map.of("attemptId", attemptId, "questionId", questionId, "awardedPoints", awarded));

        return new GradeResponse(questionId, grade.getAwardedPoints(), grade.getMaxPoints(), grade.getGradedAt());
    }

    @Transactional
    public ReleaseResponse release(Authentication auth, Long examId) {
        accessService.requireExamOwner(auth, examId);
        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(examId);
        List<Attempt> attempts = attemptRepository.findByExamIdAndGradedAtIsNotNull(examId);
        long incomplete = attempts.stream()
                .filter(attempt -> attempt.getReleasedAt() == null)
                .filter(attempt -> hasUngradedAnswers(attempt, questions))
                .count();
        if (incomplete > 0) {
            // A release is irreversible, so a partial score must never reach a student.
            throw new ResponseStatusException(HttpStatus.CONFLICT, incomplete
                    + (incomplete == 1 ? " attempt still has" : " attempts still have")
                    + " ungraded answers. Score every answer before releasing.");
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        int released = 0;
        for (Attempt attempt : attempts) {
            if (attempt.getReleasedAt() == null) {
                attempt.setReleasedAt(now);
                released++;
            }
        }
        auditService.record(accessService.currentUser(auth), examId, "GRADES_RELEASED",
                "EXAM", examId, Map.of("releasedAttempts", released));
        return new ReleaseResponse(released);
    }

    private boolean hasUngradedAnswers(Attempt attempt, List<Question> questions) {
        Set<Long> scored = new HashSet<>();
        for (AnswerGrade grade : gradeRepository.findByAttemptId(attempt.getId())) {
            if (grade.getAwardedPoints() != null) {
                scored.add(grade.getQuestion().getId());
            }
        }
        return questions.stream().anyMatch(question -> !scored.contains(question.getId()));
    }

    /** Recomputes score and maximum after grades written outside this service (code judging). */
    @Transactional
    public void recomputeTotals(Attempt attempt) {
        recomputeTotals(attempt, null);
    }

    private void recomputeTotals(Attempt attempt, Instant gradedAt) {
        List<AnswerGrade> grades = gradeRepository.findByAttemptId(attempt.getId());
        BigDecimal score = grades.stream()
                .map(AnswerGrade::getAwardedPoints)
                .filter(Objects::nonNull)
                .reduce(ZERO, BigDecimal::add);
        BigDecimal max = questionRepository.findByExamIdOrderByOrderIndexAsc(attempt.getExam().getId()).stream()
                .map(Question::getPoints)
                .filter(Objects::nonNull)
                .reduce(ZERO, BigDecimal::add);

        attempt.setScorePoints(scale(score));
        attempt.setMaxPoints(scale(max));
        if (gradedAt != null) {
            attempt.setGradedAt(gradedAt);
        }
        attemptRepository.save(attempt);
    }

    private BigDecimal score(Question question, Set<String> selected) {
        AnswerKey key = questionJson.answerKey(question);
        if (key == null || key.selectedKeys() == null) {
            return ZERO;
        }
        Set<String> expected = new LinkedHashSet<>();
        for (String value : key.selectedKeys()) {
            if (value != null && !value.isBlank()) {
                expected.add(value.trim());
            }
        }
        if (expected.isEmpty()) {
            return ZERO;
        }
        BigDecimal points = question.getPoints() == null ? ZERO : question.getPoints();
        return switch (question.getType()) {
            case SINGLE_CHOICE, TRUE_FALSE ->
                    expected.equals(selected) ? scale(points) : ZERO;
            case MULTI_CHOICE -> {
                long correct = selected.stream().filter(expected::contains).count();
                long wrong = selected.stream().filter(value -> !expected.contains(value)).count();
                BigDecimal ratio = BigDecimal.valueOf(correct - wrong)
                        .divide(BigDecimal.valueOf(expected.size()), 4, RoundingMode.HALF_UP);
                BigDecimal awarded = scale(ratio.multiply(points));
                yield awarded.signum() < 0 ? ZERO : awarded;
            }
            default -> ZERO;
        };
    }

    private static boolean isAutoGraded(QuestionType type) {
        return type == QuestionType.SINGLE_CHOICE
                || type == QuestionType.MULTI_CHOICE
                || type == QuestionType.TRUE_FALSE;
    }

    private static BigDecimal scale(BigDecimal value) {
        return (value == null ? ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }
}
