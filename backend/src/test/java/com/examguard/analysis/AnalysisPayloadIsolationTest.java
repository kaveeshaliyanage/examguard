package com.examguard.analysis;

import com.examguard.analysis.AnalysisPayloadBuilder.Payloads;
import com.examguard.domain.ActivityEvent;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.EventType;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Question;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.dto.AnalysisDtos.AuthorshipCandidatePayload;
import com.examguard.dto.AnalysisDtos.IncidentCandidatePayload;
import com.examguard.dto.AnalysisDtos.PairAnalysisRequest;
import com.examguard.dto.AnalysisDtos.PairCandidatePayload;
import com.examguard.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AnalysisPayloadIsolationTest extends ApiTestBase {

    @Autowired
    private AnalysisPayloadBuilder payloadBuilder;

    @Test
    void pairPayloadHasNoActivityFieldsAndIncidentPayloadHoldsOneCandidate() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "ISO-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.OPEN);
        Question question = question(exam, 1);

        Candidate first = candidate(exam, "ISO-A");
        Candidate second = candidate(exam, "ISO-B");
        Attempt firstAttempt = attempt(exam, first, AttemptStatus.SUBMITTED);
        Attempt secondAttempt = attempt(exam, second, AttemptStatus.SUBMITTED);

        String firstText = "The first candidate writes about a write-ahead log and quorum epochs.";
        String secondText = "The second candidate writes about service workers and alarms.";
        revision(firstAttempt, question, 1, firstText, Instant.now().minusSeconds(600));
        revision(secondAttempt, question, 1, secondText, Instant.now().minusSeconds(600));

        ActivityEvent event = new ActivityEvent();
        event.setAttempt(firstAttempt);
        event.setClientEventId("iso-1");
        event.setEventType(EventType.NAVIGATION);
        event.setDomain("chegg.com");
        event.setOccurredAt(Instant.now().minusSeconds(300));
        event.setReceivedAt(Instant.now().minusSeconds(299));
        event.setMetadataJson("{}");
        eventRepository.save(event);

        Payloads payloads = payloadBuilder.build(exam, "test-1.0");
        PairAnalysisRequest pairs = payloads.pairs();

        List<String> pairRequestFields = Arrays.stream(PairAnalysisRequest.class.getRecordComponents())
                .map(component -> component.getName()).toList();
        assertThat(pairRequestFields).doesNotContain("events", "activity", "visits", "rules");

        List<String> pairCandidateFields = Arrays.stream(PairCandidatePayload.class.getRecordComponents())
                .map(component -> component.getName()).toList();
        assertThat(pairCandidateFields).containsExactly("candidateCode", "attemptId", "answers");

        JsonNode pairJson = json.valueToTree(pairs);
        assertThat(pairJson.toString())
                .contains(firstText)
                .contains(secondText)
                .doesNotContain("chegg.com", "events", "occurredAt", "domain", "rules");

        List<IncidentCandidatePayload> incidentCandidates = payloads.incidents().candidates();
        assertThat(incidentCandidates).hasSize(2);
        for (IncidentCandidatePayload payload : incidentCandidates) {
            assertThat(payload.candidateCode()).isIn("ISO-A", "ISO-B");
            assertThat(payload.answers()).hasSize(1);
        }

        JsonNode incidentJson = json.valueToTree(payloads.incidents());
        JsonNode incidentForFirst = findCandidate(incidentJson, "ISO-A");
        assertThat(incidentForFirst.toString())
                .contains(firstText)
                .contains("chegg.com")
                .doesNotContain(secondText);

        JsonNode incidentForSecond = findCandidate(incidentJson, "ISO-B");
        assertThat(incidentForSecond.toString())
                .doesNotContain(firstText)
                .doesNotContain("chegg.com");

        JsonNode authorshipJson = json.valueToTree(payloads.authorship());
        assertThat(authorshipJson.toString())
                .doesNotContain("chegg.com", "events", "occurredAt", "domain", "rules");
        assertThat(payloads.authorship().candidates()).hasSize(2);
        for (AuthorshipCandidatePayload candidate : payloads.authorship().candidates()) {
            assertThat(candidate.answers()).hasSize(1);
        }
        assertThat(findCandidate(authorshipJson, "ISO-A").toString())
                .contains(firstText)
                .doesNotContain(secondText);
    }

    private JsonNode findCandidate(JsonNode request, String code) {
        for (JsonNode candidate : request.get("candidates")) {
            if (code.equals(candidate.get("candidateCode").asText())) {
                return candidate;
            }
        }
        throw new AssertionError("Candidate " + code + " missing from incident payload");
    }
}
