package com.examguard.analysis;

import com.examguard.domain.ActivityEvent;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Exam;
import com.examguard.domain.Question;
import com.examguard.domain.QuestionType;
import com.examguard.domain.ResourceRule;
import com.examguard.dto.AnalysisDtos.AnswerPayload;
import com.examguard.dto.AnalysisDtos.AuthorshipAnswerPayload;
import com.examguard.dto.AnalysisDtos.AuthorshipCandidatePayload;
import com.examguard.dto.AnalysisDtos.AuthorshipConfig;
import com.examguard.dto.AnalysisDtos.AuthorshipRequest;
import com.examguard.dto.AnalysisDtos.AuthorshipRevisionPayload;
import com.examguard.dto.AnalysisDtos.EventPayload;
import com.examguard.dto.AnalysisDtos.IncidentAnalysisRequest;
import com.examguard.dto.AnalysisDtos.IncidentCandidatePayload;
import com.examguard.dto.AnalysisDtos.IncidentConfig;
import com.examguard.dto.AnalysisDtos.PairAnalysisRequest;
import com.examguard.dto.AnalysisDtos.PairCandidatePayload;
import com.examguard.dto.AnalysisDtos.PairConfig;
import com.examguard.dto.AnalysisDtos.QuestionPayload;
import com.examguard.dto.AnalysisDtos.RevisionPayload;
import com.examguard.dto.AnalysisDtos.RulePayload;
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

/**
 * Builds the two analysis payloads from separate queries. Pair payloads have no events; incident
 * payloads contain exactly one candidate. This is the structural isolation the product depends on.
 */
@Component
public class AnalysisPayloadBuilder {

    private final QuestionRepository questionRepository;
    private final AttemptRepository attemptRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final ActivityEventRepository eventRepository;
    private final ResourceRuleRepository ruleRepository;

    public AnalysisPayloadBuilder(
            QuestionRepository questionRepository,
            AttemptRepository attemptRepository,
            AnswerRevisionRepository revisionRepository,
            ActivityEventRepository eventRepository,
            ResourceRuleRepository ruleRepository) {
        this.questionRepository = questionRepository;
        this.attemptRepository = attemptRepository;
        this.revisionRepository = revisionRepository;
        this.eventRepository = eventRepository;
        this.ruleRepository = ruleRepository;
    }

    public record Payloads(
            PairAnalysisRequest pairs,
            IncidentAnalysisRequest incidents,
            AuthorshipRequest authorship) {
    }

    public Payloads build(Exam exam, String modelVersion) {
        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(exam.getId());
        // A correct solution is naturally the same for every candidate. Comparing code across
        // candidates would turn good answers into apparent collusion, so code stays out of the
        // pair and authorship models. Activity events are unaffected.
        List<Question> proseQuestions = questions.stream()
                .filter(question -> question.getType() != QuestionType.CODE)
                .toList();
        List<Attempt> attempts = attemptRepository
                .findByExamIdAndStatusWithCandidate(exam.getId(), AttemptStatus.SUBMITTED);
        List<QuestionPayload> questionPayloads = proseQuestions.stream()
                .map(question -> new QuestionPayload(question.getId(), question.getPrompt()))
                .toList();

        List<PairCandidatePayload> pairCandidates = new ArrayList<>();
        List<IncidentCandidatePayload> incidentCandidates = new ArrayList<>();
        List<AuthorshipCandidatePayload> authorshipCandidates = new ArrayList<>();
        for (Attempt attempt : attempts) {
            Map<Long, List<RevisionPayload>> revisionsByQuestion = revisionsByQuestion(attempt.getId());
            List<AnswerPayload> answers = answerPayloads(questions, revisionsByQuestion);
            List<AnswerPayload> proseAnswers = answerPayloads(proseQuestions, revisionsByQuestion);
            pairCandidates.add(new PairCandidatePayload(
                    attempt.getCandidate().getCode(), attempt.getId(), proseAnswers));
            incidentCandidates.add(new IncidentCandidatePayload(
                    attempt.getCandidate().getCode(),
                    attempt.getId(),
                    answers,
                    eventPayloads(attempt.getId()),
                    attempt.getStartedAt(),
                    monitoringEnd(attempt),
                    exam.getDurationMinutes(),
                    attempt.isExtensionConnected()));
            authorshipCandidates.add(new AuthorshipCandidatePayload(
                    attempt.getCandidate().getCode(), attempt.getId(), authorshipAnswers(proseAnswers)));
        }

        PairAnalysisRequest pairRequest = new PairAnalysisRequest(
                exam.getId(), modelVersion, questionPayloads, pairCandidates,
                new PairConfig(20, 0.5, 3, 120, 500));
        IncidentAnalysisRequest incidentRequest = new IncidentAnalysisRequest(
                exam.getId(), modelVersion, incidentCandidates, rulePayloads(exam.getId()),
                new IncidentConfig(120, 60.0, 500));
        AuthorshipRequest authorshipRequest = new AuthorshipRequest(
                exam.getId(), modelVersion, authorshipCandidates, new AuthorshipConfig(200, 500));
        return new Payloads(pairRequest, incidentRequest, authorshipRequest);
    }

    private List<AuthorshipAnswerPayload> authorshipAnswers(List<AnswerPayload> answers) {
        return answers.stream()
                .map(answer -> new AuthorshipAnswerPayload(
                        answer.questionId(),
                        answer.text(),
                        answer.revisions().stream()
                                .map(revision -> new AuthorshipRevisionPayload(
                                        revision.revisionNo(), revision.text(), revision.savedAt()))
                                .toList()))
                .toList();
    }

    private Map<Long, List<RevisionPayload>> revisionsByQuestion(Long attemptId) {
        Map<Long, List<RevisionPayload>> grouped = new LinkedHashMap<>();
        for (AnswerRevision revision : revisionRepository
                .findByAttemptIdOrderByQuestionIdAscRevisionNoAsc(attemptId)) {
            grouped.computeIfAbsent(revision.getQuestion().getId(), key -> new ArrayList<>())
                    .add(new RevisionPayload(revision.getRevisionNo(), revision.getText(), revision.getSavedAt()));
        }
        return grouped;
    }

    private List<AnswerPayload> answerPayloads(
            List<Question> questions, Map<Long, List<RevisionPayload>> revisionsByQuestion) {
        List<AnswerPayload> answers = new ArrayList<>();
        for (Question question : questions) {
            List<RevisionPayload> revisions = revisionsByQuestion.getOrDefault(question.getId(), List.of());
            String text = revisions.isEmpty() ? "" : revisions.get(revisions.size() - 1).text();
            answers.add(new AnswerPayload(question.getId(), text, revisions));
        }
        return answers;
    }

    private List<EventPayload> eventPayloads(Long attemptId) {
        return eventRepository.findByAttemptIdOrderByOccurredAtAsc(attemptId).stream()
                .map(this::eventPayload)
                .toList();
    }

    private EventPayload eventPayload(ActivityEvent event) {
        return new EventPayload(
                event.getEventType().name(),
                event.getDomain(),
                event.getOccurredAt(),
                event.getReceivedAt(),
                event.getTabId());
    }

    private List<RulePayload> rulePayloads(Long examId) {
        return ruleRepository.findByExamIdOrderByIdAsc(examId).stream()
                .map(this::rulePayload)
                .toList();
    }

    private RulePayload rulePayload(ResourceRule rule) {
        return new RulePayload(rule.getCategory().name(), rule.getDomainPattern(), rule.getNote());
    }

    private Instant monitoringEnd(Attempt attempt) {
        if (attempt.getSubmittedAt() != null) {
            return attempt.getSubmittedAt();
        }
        return attempt.getLastSeenAt() != null ? attempt.getLastSeenAt() : Instant.now();
    }
}
