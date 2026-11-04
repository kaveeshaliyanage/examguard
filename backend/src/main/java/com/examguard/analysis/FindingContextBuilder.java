package com.examguard.analysis;

import com.examguard.analysis.FindingViewDtos.IncidentContext;
import com.examguard.analysis.FindingViewDtos.ObservedEvent;
import com.examguard.analysis.FindingViewDtos.PairAnswer;
import com.examguard.analysis.FindingViewDtos.PairCandidate;
import com.examguard.analysis.FindingViewDtos.PairContext;
import com.examguard.analysis.FindingViewDtos.RevisionView;
import com.examguard.attempt.CoverageCalculator;
import com.examguard.domain.ActivityEvent;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.Candidate;
import com.examguard.domain.EventType;
import com.examguard.domain.Exam;
import com.examguard.domain.Question;
import com.examguard.domain.ResourceRule;
import com.examguard.dto.CommonDtos.ExamQuestionView;
import com.examguard.repo.ActivityEventRepository;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.repo.ResourceRuleRepository;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Builds reviewer context. Pair context contains only answers for the two named candidates;
 * incident context contains only one candidate and their events. Never mix them.
 */
@Component
public class FindingContextBuilder {

    private final QuestionRepository questionRepository;
    private final AttemptRepository attemptRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final ActivityEventRepository eventRepository;
    private final ResourceRuleRepository ruleRepository;
    private final RuleMatcher ruleMatcher;

    public FindingContextBuilder(
            QuestionRepository questionRepository,
            AttemptRepository attemptRepository,
            AnswerRevisionRepository revisionRepository,
            ActivityEventRepository eventRepository,
            ResourceRuleRepository ruleRepository,
            RuleMatcher ruleMatcher) {
        this.questionRepository = questionRepository;
        this.attemptRepository = attemptRepository;
        this.revisionRepository = revisionRepository;
        this.eventRepository = eventRepository;
        this.ruleRepository = ruleRepository;
        this.ruleMatcher = ruleMatcher;
    }

    public PairContext pairContext(Exam exam, Candidate candidateA, Candidate candidateB) {
        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(exam.getId());
        List<ExamQuestionView> questionViews = questions.stream()
                .map(question -> new ExamQuestionView(
                        question.getId(), question.getOrderIndex(), question.getPrompt(), question.getMaxWords()))
                .toList();
        List<PairCandidate> candidates = new ArrayList<>();
        candidates.add(pairCandidate(exam, candidateA, questions));
        if (candidateB != null) {
            candidates.add(pairCandidate(exam, candidateB, questions));
        }
        return new PairContext(questionViews, candidates);
    }

    public IncidentContext incidentContext(Exam exam, Candidate candidate) {
        Optional<Attempt> attempt = attemptRepository.findByExamIdAndCandidateId(exam.getId(), candidate.getId());
        if (attempt.isEmpty()) {
            return new IncidentContext(candidate.getCode(), null, null, 0.0, true, List.of());
        }
        Attempt value = attempt.get();
        List<ActivityEvent> events = eventRepository.findByAttemptIdOrderByOccurredAtAsc(value.getId());
        Instant monitoringEnd = value.getSubmittedAt() != null
                ? value.getSubmittedAt()
                : value.getLastSeenAt() != null ? value.getLastSeenAt() : Instant.now();
        CoverageCalculator.Coverage coverage = CoverageCalculator.compute(
                value.getStartedAt(), monitoringEnd, events.stream().map(ActivityEvent::getOccurredAt).toList());
        List<ResourceRule> rules = ruleRepository.findByExamIdOrderByIdAsc(exam.getId());
        return new IncidentContext(
                candidate.getCode(),
                value.getStartedAt(),
                monitoringEnd,
                coverage.percent(),
                coverage.warning(),
                events.stream().map(event -> observed(event, rules)).toList());
    }

    private PairCandidate pairCandidate(Exam exam, Candidate candidate, List<Question> questions) {
        Optional<Attempt> attempt = attemptRepository.findByExamIdAndCandidateId(exam.getId(), candidate.getId());
        if (attempt.isEmpty()) {
            List<PairAnswer> empty = questions.stream()
                    .map(question -> new PairAnswer(question.getId(), "", List.of()))
                    .toList();
            return new PairCandidate(candidate.getCode(), empty);
        }
        Map<Long, List<AnswerRevision>> grouped = grouped(attempt.get().getId());
        List<PairAnswer> answers = new ArrayList<>();
        for (Question question : questions) {
            List<AnswerRevision> revisions = grouped.getOrDefault(question.getId(), List.of());
            String text = revisions.isEmpty() ? "" : revisions.get(revisions.size() - 1).getText();
            answers.add(new PairAnswer(question.getId(), text, revisions.stream()
                    .map(revision -> new RevisionView(
                            revision.getRevisionNo(), revision.getText(), revision.getSavedAt()))
                    .toList()));
        }
        return new PairCandidate(candidate.getCode(), answers);
    }

    private Map<Long, List<AnswerRevision>> grouped(Long attemptId) {
        Map<Long, List<AnswerRevision>> grouped = new LinkedHashMap<>();
        for (AnswerRevision revision : revisionRepository
                .findByAttemptIdOrderByQuestionIdAscRevisionNoAsc(attemptId)) {
            grouped.computeIfAbsent(revision.getQuestion().getId(), key -> new ArrayList<>()).add(revision);
        }
        return grouped;
    }

    private ObservedEvent observed(ActivityEvent event, List<ResourceRule> rules) {
        if (event.getEventType() != EventType.NAVIGATION || event.getDomain() == null) {
            return new ObservedEvent(event.getEventType().name(), null, event.getOccurredAt(), null, null);
        }
        RuleMatcher.Classification classification = ruleMatcher.classify(event.getDomain(), rules);
        return new ObservedEvent(
                event.getEventType().name(),
                event.getDomain(),
                event.getOccurredAt(),
                classification.category().name(),
                classification.rulePattern());
    }
}
