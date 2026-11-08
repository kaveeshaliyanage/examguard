package com.examguard.service;

import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamPermission;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.Question;
import com.examguard.domain.ResourceCategory;
import com.examguard.domain.ResourceRule;
import com.examguard.domain.User;
import com.examguard.repo.CandidateRepository;
import com.examguard.repo.ExamPermissionRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.repo.ResourceRuleRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
class DemoExamSeeder {

    static final String EXAM_CODE = "DEMO-101";

    private static final int QUESTION_MAX_WORDS = 250;

    private final ExamRepository examRepository;
    private final ExamPermissionRepository permissionRepository;
    private final QuestionRepository questionRepository;
    private final ResourceRuleRepository ruleRepository;
    private final CandidateRepository candidateRepository;

    DemoExamSeeder(
            ExamRepository examRepository,
            ExamPermissionRepository permissionRepository,
            QuestionRepository questionRepository,
            ResourceRuleRepository ruleRepository,
            CandidateRepository candidateRepository) {
        this.examRepository = examRepository;
        this.permissionRepository = permissionRepository;
        this.questionRepository = questionRepository;
        this.ruleRepository = ruleRepository;
        this.candidateRepository = candidateRepository;
    }

    SeededExam seed(User lecturer, User reviewer) {
        Exam exam = new Exam();
        exam.setCode(EXAM_CODE);
        exam.setTitle("Demo Examination: Systems and Integrity");
        exam.setDescription("""
                A four-question short-answer demonstration exam. The seeded attempts contain scripted
                scenarios for independent work, shared phrasing, paraphrasing and resource-policy
                deviations. They are not real misconduct data.""");
        exam.setDurationMinutes(60);
        exam.setStatus(ExamStatus.OPEN);
        exam.setAllowExtension(true);
        exam.setCreatedBy(lecturer);
        exam = examRepository.save(exam);

        permissionRepository.save(permission(exam, lecturer, PermissionLevel.OWNER));
        permissionRepository.save(permission(exam, reviewer, PermissionLevel.REVIEWER));

        List<Question> questions = List.of(
                createQuestion(exam, 1, DemoCohort.Q1),
                createQuestion(exam, 2, DemoCohort.Q2),
                createQuestion(exam, 3, DemoCohort.Q3),
                createQuestion(exam, 4, DemoCohort.Q4));

        createRule(exam, ResourceCategory.PERMITTED, "*.edu", "University-hosted resources");
        createRule(exam, ResourceCategory.PERMITTED, "docs.spring.io", "Course textbook documentation");
        createRule(exam, ResourceCategory.PERMITTED, "localhost", "Local development environment");
        createRule(exam, ResourceCategory.PROHIBITED, "chegg.com", "Contract cheating service");
        createRule(exam, ResourceCategory.PROHIBITED, "coursehero.com", "Contract cheating service");
        createRule(exam, ResourceCategory.PROHIBITED, "chat.openai.com", "Generative AI assistant");
        createRule(exam, ResourceCategory.PROHIBITED, "*.studocu.com", "Uploaded course material");

        List<Candidate> candidates = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            candidates.add(createCandidate(exam, String.format("C%03d", i), "Candidate " + i));
        }

        return new SeededExam(exam, questions, candidates);
    }

    private ExamPermission permission(Exam exam, User user, PermissionLevel level) {
        ExamPermission permission = new ExamPermission();
        permission.setExam(exam);
        permission.setUser(user);
        permission.setLevel(level);
        return permission;
    }

    private Question createQuestion(Exam exam, int order, String prompt) {
        Question question = new Question();
        question.setExam(exam);
        question.setOrderIndex(order);
        question.setPrompt(prompt);
        question.setMaxWords(QUESTION_MAX_WORDS);
        return questionRepository.save(question);
    }

    private void createRule(Exam exam, ResourceCategory category, String pattern, String note) {
        ResourceRule rule = new ResourceRule();
        rule.setExam(exam);
        rule.setCategory(category);
        rule.setDomainPattern(pattern);
        rule.setNote(note);
        ruleRepository.save(rule);
    }

    private Candidate createCandidate(Exam exam, String code, String label) {
        Candidate candidate = new Candidate();
        candidate.setExam(exam);
        candidate.setCode(code);
        candidate.setDisplayLabel(label);
        return candidateRepository.save(candidate);
    }

    record SeededExam(Exam exam, List<Question> questions, List<Candidate> candidates) {
    }
}
