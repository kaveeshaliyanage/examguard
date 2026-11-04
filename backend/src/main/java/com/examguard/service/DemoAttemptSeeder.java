package com.examguard.service;

import com.examguard.domain.ActivityEvent;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.EventType;
import com.examguard.domain.Exam;
import com.examguard.domain.Question;
import com.examguard.repo.ActivityEventRepository;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.service.DemoCohort.AnswerSpec;
import com.examguard.service.DemoCohort.EventSpec;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Component
class DemoAttemptSeeder {

    private final AttemptRepository attemptRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final ActivityEventRepository eventRepository;

    private long eventSeq = 0;

    DemoAttemptSeeder(
            AttemptRepository attemptRepository,
            AnswerRevisionRepository revisionRepository,
            ActivityEventRepository eventRepository) {
        this.attemptRepository = attemptRepository;
        this.revisionRepository = revisionRepository;
        this.eventRepository = eventRepository;
    }

    void seed(DemoExamSeeder.SeededExam seeded, Instant start, Instant submit) {
        Exam exam = seeded.exam();
        List<Question> questions = seeded.questions();
        List<Candidate> candidates = seeded.candidates();

        // C001 and C002 share an invented phrase across Q1 and Q3 and save those answers close in time.
        seedAttempt(exam, candidates.get(0), start, submit, true,
                answers(questions, List.of(DemoCohort.C001_Q1, DemoCohort.C001_Q2,
                        DemoCohort.C001_Q3, DemoCohort.C001_Q4),
                        List.of(at(start, 840), at(start, 1560), at(start, 2280), at(start, 3000))),
                fullCoverage(start, List.of(
                        new EventSpec(EventType.NAVIGATION, "university.edu", at(start, 600)))));

        seedAttempt(exam, candidates.get(1), start, submit, true,
                answers(questions, List.of(DemoCohort.C002_Q1, DemoCohort.C002_Q2,
                        DemoCohort.C002_Q3, DemoCohort.C002_Q4),
                        List.of(at(start, 875), at(start, 1580), at(start, 2330), at(start, 3020))),
                fullCoverage(start, List.of()));

        // C003 paraphrases C001's Q1 and Q3 without the shared rare phrase.
        seedAttempt(exam, candidates.get(2), start, submit, true,
                answers(questions, List.of(DemoCohort.C003_Q1, DemoCohort.C003_Q2,
                        DemoCohort.C003_Q3, DemoCohort.C003_Q4),
                        List.of(at(start, 1080), at(start, 1680), at(start, 2520), at(start, 3180))),
                fullCoverage(start, List.of()));

        // C004 visits prohibited domains shortly before answer changes.
        seedAttempt(exam, candidates.get(3), start, submit, true,
                answers(questions, List.of(DemoCohort.C004_Q1, DemoCohort.C004_Q2,
                        DemoCohort.C004_Q3, DemoCohort.C004_Q4),
                        List.of(at(start, 2040), at(start, 2400), at(start, 1260), at(start, 2880))),
                fullCoverage(start, List.of(
                        new EventSpec(EventType.NAVIGATION, "chegg.com", at(start, 1200)),
                        new EventSpec(EventType.NAVIGATION, "coursehero.com", at(start, 1920)))));

        // C005 visits an unclassified domain (not prohibited by the rules).
        seedAttempt(exam, candidates.get(4), start, submit, true,
                answers(questions, List.of(DemoCohort.C005_Q1, DemoCohort.C005_Q2,
                        DemoCohort.C005_Q3, DemoCohort.C005_Q4),
                        List.of(at(start, 1080), at(start, 945), at(start, 1980), at(start, 2700))),
                fullCoverage(start, List.of(
                        new EventSpec(EventType.NAVIGATION, "wikipedia.org", at(start, 900)))));

        // C006 uses only permitted resources.
        seedAttempt(exam, candidates.get(5), start, submit, true,
                answers(questions, List.of(DemoCohort.C006_Q1, DemoCohort.C006_Q2,
                        DemoCohort.C006_Q3, DemoCohort.C006_Q4),
                        List.of(at(start, 960), at(start, 1500), at(start, 2100), at(start, 2760))),
                fullCoverage(start, List.of(
                        new EventSpec(EventType.NAVIGATION, "university.edu", at(start, 720)),
                        new EventSpec(EventType.NAVIGATION, "docs.spring.io", at(start, 1500)))));

        // C007 has sparse coverage and a prohibited visit: the incident score must be capped.
        seedAttempt(exam, candidates.get(6), start, submit, true,
                answers(questions, List.of(DemoCohort.C007_Q1, DemoCohort.C007_Q2,
                        DemoCohort.C007_Q3, DemoCohort.C007_Q4),
                        List.of(at(start, 510), at(start, 1200), at(start, 1800), at(start, 2400))),
                List.of(
                        new EventSpec(EventType.EXTENSION_CONNECTED, null, at(start, 30)),
                        new EventSpec(EventType.NAVIGATION, "coursehero.com", at(start, 480))));

        // C008 did not connect the extension: activity is unknown, not clean.
        seedAttempt(exam, candidates.get(7), start, submit, false,
                answers(questions, List.of(DemoCohort.C008_Q1, DemoCohort.C008_Q2,
                        DemoCohort.C008_Q3, DemoCohort.C008_Q4),
                        List.of(at(start, 900), at(start, 1440), at(start, 2160), at(start, 2820))),
                List.of());
    }

    private List<AnswerSpec> answers(List<Question> questions, List<String> texts, List<Instant> times) {
        List<AnswerSpec> specs = new ArrayList<>();
        for (int i = 0; i < questions.size(); i++) {
            specs.add(new AnswerSpec(questions.get(i), texts.get(i), times.get(i)));
        }
        return specs;
    }

    private List<EventSpec> fullCoverage(Instant start, List<EventSpec> extra) {
        List<EventSpec> events = new ArrayList<>();
        events.add(new EventSpec(EventType.EXTENSION_CONNECTED, null, at(start, 30)));
        for (int minute = 2; minute <= 52; minute += 10) {
            events.add(new EventSpec(EventType.HEARTBEAT, null, at(start, minute * 60)));
        }
        events.add(new EventSpec(EventType.HEARTBEAT, null, at(start, 59 * 60)));
        events.addAll(extra);
        events.sort((a, b) -> a.at().compareTo(b.at()));
        return events;
    }

    private void seedAttempt(Exam exam, Candidate candidate, Instant start, Instant submit,
                             boolean extensionConnected, List<AnswerSpec> answers,
                             List<EventSpec> events) {
        Attempt attempt = new Attempt();
        attempt.setExam(exam);
        attempt.setCandidate(candidate);
        attempt.setStatus(AttemptStatus.SUBMITTED);
        attempt.setStartedAt(start);
        attempt.setSubmittedAt(submit);
        attempt.setLastSeenAt(submit);
        attempt.setExtensionConnected(extensionConnected);
        attempt.setLateSubmission(false);
        attempt = attemptRepository.save(attempt);

        for (AnswerSpec spec : answers) {
            saveRevision(attempt, spec.question(), 1, draft(spec.text()), spec.at().minusSeconds(300), 1L);
            saveRevision(attempt, spec.question(), 2, spec.text(), spec.at(), 2L);
        }

        for (EventSpec event : events) {
            ActivityEvent entity = new ActivityEvent();
            entity.setAttempt(attempt);
            entity.setClientEventId("seed-" + candidate.getCode() + "-" + (++eventSeq));
            entity.setEventType(event.type());
            entity.setDomain(event.domain());
            entity.setOccurredAt(event.at());
            entity.setReceivedAt(event.at().plusSeconds(2));
            entity.setMetadataJson("{}");
            eventRepository.save(entity);
        }
    }

    private void saveRevision(Attempt attempt, Question question, int revisionNo,
                              String text, Instant at, long clientSeq) {
        AnswerRevision revision = new AnswerRevision();
        revision.setAttempt(attempt);
        revision.setQuestion(question);
        revision.setRevisionNo(revisionNo);
        revision.setText(text);
        revision.setClientSeq(clientSeq);
        revision.setSavedAt(at);
        revisionRepository.save(revision);
    }

    private String draft(String text) {
        String cleaned = text.replaceAll("\\s+", " ").trim();
        return cleaned.length() <= 90 ? cleaned : cleaned.substring(0, 90) + "...";
    }

    private Instant at(Instant start, int seconds) {
        return start.plusSeconds(seconds);
    }
}
