package com.examguard.exam;

import com.examguard.domain.Exam;
import com.examguard.domain.GradingMode;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.exam.ExamDtos.QuestionPayload;
import com.examguard.exam.ExamDtos.StaffQuestionView;
import com.examguard.exam.QuestionPayloads.AnswerKey;
import com.examguard.exam.QuestionPayloads.Content;
import com.examguard.exam.QuestionPayloads.Option;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class QuestionService {

    private static final Set<QuestionType> CHOICE_TYPES =
            EnumSet.of(QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE);
    private static final Set<QuestionType> AUTO_TYPES =
            EnumSet.of(QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE, QuestionType.TRUE_FALSE);
    private static final BigDecimal MAX_POINTS = new BigDecimal("100");
    private static final BigDecimal DEFAULT_POINTS = new BigDecimal("1.00");
    private static final int DEFAULT_MAX_WORDS = 500;

    private final ExamRepository examRepository;
    private final QuestionRepository questionRepository;
    private final QuestionJson questionJson;
    private final AccessService accessService;
    private final AuditService auditService;

    public QuestionService(
            ExamRepository examRepository,
            QuestionRepository questionRepository,
            QuestionJson questionJson,
            AccessService accessService,
            AuditService auditService) {
        this.examRepository = examRepository;
        this.questionRepository = questionRepository;
        this.questionJson = questionJson;
        this.accessService = accessService;
        this.auditService = auditService;
    }

    @Transactional
    public List<Question> createAll(Exam exam, List<QuestionPayload> payloads) {
        List<Question> created = new ArrayList<>();
        for (int index = 0; index < payloads.size(); index++) {
            Question question = new Question();
            question.setExam(exam);
            question.setOrderIndex(index + 1);
            apply(question, payloads.get(index));
            created.add(questionRepository.save(question));
        }
        return created;
    }

    @Transactional
    public StaffQuestionView create(Authentication auth, Long examId, QuestionPayload payload) {
        accessService.requireExamOwner(auth, examId);
        Exam exam = findExam(examId);
        Question question = new Question();
        question.setExam(exam);
        question.setOrderIndex(nextOrderIndex(examId));
        apply(question, payload);
        questionRepository.save(question);
        auditService.record(accessService.currentUser(auth), examId, "QUESTION_CREATED",
                "QUESTION", question.getId(), Map.of("orderIndex", question.getOrderIndex()));
        return view(question);
    }

    @Transactional
    public StaffQuestionView update(Authentication auth, Long examId, Long questionId, QuestionPayload payload) {
        accessService.requireExamOwner(auth, examId);
        Question question = findQuestion(examId, questionId);
        apply(question, payload);
        questionRepository.save(question);
        auditService.record(accessService.currentUser(auth), examId, "QUESTION_UPDATED",
                "QUESTION", questionId, Map.of("orderIndex", question.getOrderIndex()));
        return view(question);
    }

    @Transactional
    public void delete(Authentication auth, Long examId, Long questionId) {
        accessService.requireExamOwner(auth, examId);
        Question question = findQuestion(examId, questionId);
        questionRepository.delete(question);
        auditService.record(accessService.currentUser(auth), examId, "QUESTION_DELETED",
                "QUESTION", questionId, Map.of("orderIndex", question.getOrderIndex()));
    }

    @Transactional
    public List<StaffQuestionView> reorder(Authentication auth, Long examId, List<Long> questionIds) {
        accessService.requireExamOwner(auth, examId);
        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(examId);
        Map<Long, Question> byId = new LinkedHashMap<>();
        questions.forEach(question -> byId.put(question.getId(), question));

        if (questionIds.size() != questions.size() || !new HashSet<>(questionIds).equals(byId.keySet())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "questionIds must list every question of this exam exactly once");
        }

        for (int index = 0; index < questions.size(); index++) {
            questions.get(index).setOrderIndex(-(index + 1));
        }
        questionRepository.saveAll(questions);
        questionRepository.flush();

        List<Question> ordered = new ArrayList<>();
        for (int index = 0; index < questionIds.size(); index++) {
            Question question = byId.get(questionIds.get(index));
            question.setOrderIndex(index + 1);
            ordered.add(question);
        }
        questionRepository.saveAll(ordered);
        questionRepository.flush();

        auditService.record(accessService.currentUser(auth), examId, "QUESTIONS_REORDERED",
                "EXAM", examId, Map.of("questionIds", questionIds));
        return ordered.stream().map(this::view).toList();
    }

    public StaffQuestionView view(Question question) {
        return new StaffQuestionView(
                question.getId(),
                question.getOrderIndex(),
                question.getPrompt(),
                question.getType(),
                question.getPoints(),
                question.getGradingMode(),
                question.getMaxWords(),
                questionJson.content(question),
                questionJson.answerKeyNode(question),
                question.getExplanation());
    }

    private void apply(Question question, QuestionPayload payload) {
        boolean typed = payload.type() != null;
        QuestionType type = typed ? payload.type() : QuestionType.ESSAY;

        BigDecimal points = payload.points() == null ? DEFAULT_POINTS : payload.points();
        if (points.compareTo(BigDecimal.ZERO) <= 0 || points.compareTo(MAX_POINTS) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Question points must be greater than 0 and at most 100");
        }

        GradingMode mode = payload.gradingMode() == null ? GradingMode.MANUAL : payload.gradingMode();
        if (mode == GradingMode.AUTO && !AUTO_TYPES.contains(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "AUTO grading is only valid for choice and true/false questions");
        }

        boolean freeText = type == QuestionType.SHORT_ANSWER || type == QuestionType.ESSAY;
        int maxWords = freeText ? (payload.maxWords() == null ? DEFAULT_MAX_WORDS : payload.maxWords()) : 0;

        Set<String> optionKeys = applyContent(question, type, payload);
        if (typed) {
            applyAnswerKey(question, type, optionKeys, payload.answerKey());
        } else {
            question.setAnswerKeyJson(null);
        }

        question.setPrompt(payload.prompt().trim());
        question.setType(type);
        question.setPoints(points.setScale(2, java.math.RoundingMode.HALF_UP));
        question.setGradingMode(mode);
        question.setMaxWords(maxWords);
        question.setExplanation(trimToNull(payload.explanation()));
    }

    private Set<String> applyContent(Question question, QuestionType type, QuestionPayload payload) {
        if (!CHOICE_TYPES.contains(type)) {
            question.setContentJson("{}");
            return Set.of();
        }
        List<Option> options = payload.content() == null ? null : payload.content().options();
        if (options == null || options.size() < 2 || options.size() > 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Choice questions need between 2 and 10 options");
        }
        Set<String> keys = new LinkedHashSet<>();
        List<Option> normalized = new ArrayList<>();
        for (Option option : options) {
            String key = option == null || option.key() == null ? null : option.key().trim();
            if (key == null || key.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every option needs a key");
            }
            if (!keys.add(key)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Option keys must be unique");
            }
            normalized.add(new Option(key, option.text() == null ? "" : option.text().trim()));
        }
        question.setContentJson(questionJson.write(new Content(normalized)));
        return keys;
    }

    private void applyAnswerKey(Question question, QuestionType type, Set<String> optionKeys, AnswerKey key) {
        if (key == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An answer key is required for this question");
        }
        List<String> selected = key.selectedKeys() == null
                ? List.of()
                : key.selectedKeys().stream().filter(value -> value != null && !value.isBlank()).map(String::trim).toList();
        List<String> accepted = key.acceptedAnswers() == null
                ? List.of()
                : key.acceptedAnswers().stream().filter(value -> value != null && !value.isBlank()).toList();

        switch (type) {
            case SINGLE_CHOICE, MULTI_CHOICE -> {
                if (selected.isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "A choice answer key needs at least one selectedKey");
                }
                if (!optionKeys.containsAll(selected)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "The answer key references an option that does not exist");
                }
            }
            case TRUE_FALSE -> {
                if (selected.size() != 1 || !(selected.contains("A") || selected.contains("B"))) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "True/false questions need exactly one of the keys A or B");
                }
            }
            case SHORT_ANSWER -> {
                if (accepted.isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Short-answer questions need at least one accepted answer");
                }
            }
            case ESSAY -> {
                if (isBlank(key.modelAnswer()) && isBlank(key.rubric())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Essay questions need a rubric or a model answer");
                }
            }
        }
        question.setAnswerKeyJson(questionJson.write(
                new AnswerKey(selected, accepted, trimToNull(key.modelAnswer()), trimToNull(key.rubric()))));
    }

    private int nextOrderIndex(Long examId) {
        return questionRepository.findByExamIdOrderByOrderIndexAsc(examId).stream()
                .mapToInt(Question::getOrderIndex)
                .max()
                .orElse(0) + 1;
    }

    private Exam findExam(Long examId) {
        return examRepository.findById(examId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exam not found"));
    }

    private Question findQuestion(Long examId, Long questionId) {
        return questionRepository.findByIdAndExamId(questionId, examId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
