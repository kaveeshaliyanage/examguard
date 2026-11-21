package com.examguard.analysis;

import com.examguard.domain.ActivityEvent;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.EventType;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Finding;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.FindingType;
import com.examguard.domain.Question;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.dto.AnalysisDtos.AnalysisResponse;
import com.examguard.dto.AnalysisDtos.AuthorshipRequest;
import com.examguard.dto.AnalysisDtos.AuthorshipResponse;
import com.examguard.dto.AnalysisDtos.EvidenceResult;
import com.examguard.dto.AnalysisDtos.FindingResult;
import com.examguard.dto.AnalysisDtos.IncidentAnalysisRequest;
import com.examguard.dto.AnalysisDtos.PairAnalysisRequest;
import com.examguard.service.AnalysisClient;
import com.examguard.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AnalysisFlowTest extends ApiTestBase {

    @MockitoBean
    private AnalysisClient analysisClient;

    private record Cohort(Exam exam, User owner) {
    }

    private Cohort cohort() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "FLOW-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.OPEN);
        Question question = question(exam, 1);
        Candidate first = candidate(exam, "FLOW-A");
        Candidate second = candidate(exam, "FLOW-B");
        Attempt firstAttempt = attempt(exam, first, AttemptStatus.SUBMITTED);
        Attempt secondAttempt = attempt(exam, second, AttemptStatus.SUBMITTED);
        revision(firstAttempt, question, 1,
                "A write-ahead log records changes before pages are flushed.", Instant.now().minusSeconds(900));
        revision(secondAttempt, question, 1,
                "A write-ahead log records changes before pages are flushed.", Instant.now().minusSeconds(890));

        ActivityEvent event = new ActivityEvent();
        event.setAttempt(firstAttempt);
        event.setClientEventId("flow-" + UUID.randomUUID());
        event.setEventType(EventType.NAVIGATION);
        event.setDomain("chegg.com");
        event.setOccurredAt(Instant.now().minusSeconds(500));
        event.setReceivedAt(Instant.now().minusSeconds(499));
        event.setMetadataJson("{}");
        eventRepository.save(event);

        return new Cohort(exam, owner);
    }

    private FindingResult pairFinding() {
        return new FindingResult("CANDIDATE_PAIR", "FLOW-A", "FLOW-B", null, 68.0, "HIGH",
                "Shared phrasing with aligned revision timing", false,
                List.of(new EvidenceResult("LEXICAL", 0.8, null,
                        "Answers share a distinctive phrase", Map.of("similarity", 0.86))));
    }

    private FindingResult incidentFinding() {
        return new FindingResult("CANDIDATE_INCIDENT", "FLOW-A", null, null, 72.0, "HIGH",
                "Prohibited resource visited near an answer change", false,
                List.of(new EvidenceResult("DOMAIN", 0.7, null,
                        "Navigation to a prohibited domain", Map.of("domain", "chegg.com"))));
    }

    private void stubSuccess() {
        given(analysisClient.analyzePairs(any(PairAnalysisRequest.class)))
                .willReturn(new AnalysisResponse("mock-1.0", List.of(pairFinding()), Map.of()));
        given(analysisClient.analyzeIncidents(any(IncidentAnalysisRequest.class)))
                .willReturn(new AnalysisResponse("mock-1.0", List.of(incidentFinding()), Map.of()));
        given(analysisClient.analyzeAuthorship(any(AuthorshipRequest.class)))
                .willReturn(new AuthorshipResponse("mock-1.0", List.of(), Map.of()));
    }

    @Test
    void runPersistsFindingsAndKeepsPairAndIncidentContextsSeparate() throws Exception {
        Cohort cohort = cohort();
        stubSuccess();

        mvc.perform(post("/api/exams/" + cohort.exam().getId() + "/analysis-runs")
                        .header("Authorization", bearer(cohort.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.findingsCreated").value(2))
                .andExpect(jsonPath("$.modelVersion").value("mock-1.0"))
                .andExpect(jsonPath("$.inputHash").isString())
                .andExpect(jsonPath("$.error").doesNotExist())
                .andExpect(jsonPath("$.finishedAt").exists());

        mvc.perform(get("/api/exams/" + cohort.exam().getId() + "/findings")
                        .header("Authorization", bearer(cohort.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.type == 'CANDIDATE_PAIR')]").exists())
                .andExpect(jsonPath("$[?(@.type == 'CANDIDATE_INCIDENT')]").exists());

        Finding pair = findingRepository
                .findByExamIdAndTypeOrderByPriorityScoreDesc(cohort.exam().getId(), FindingType.CANDIDATE_PAIR)
                .getFirst();
        Finding incident = findingRepository
                .findByExamIdAndTypeOrderByPriorityScoreDesc(cohort.exam().getId(), FindingType.CANDIDATE_INCIDENT)
                .getFirst();

        mvc.perform(get("/api/findings/" + pair.getId()).header("Authorization", bearer(cohort.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pairContext.candidates.length()").value(2))
                .andExpect(jsonPath("$.pairContext.questions.length()").value(1))
                .andExpect(jsonPath("$.incidentContext").doesNotExist())
                .andExpect(jsonPath("$.evidence[0].metadata.similarity").value(0.86));
        mvc.perform(get("/api/findings/" + incident.getId()).header("Authorization", bearer(cohort.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pairContext").doesNotExist())
                .andExpect(jsonPath("$.incidentContext.candidateCode").value("FLOW-A"))
                .andExpect(jsonPath("$.incidentContext.events[0].classification").exists());

        mvc.perform(get("/api/exams/" + cohort.exam().getId() + "/analysis-runs")
                        .header("Authorization", bearer(cohort.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        then(analysisClient).should().analyzePairs(any(PairAnalysisRequest.class));
        then(analysisClient).should().analyzeIncidents(any(IncidentAnalysisRequest.class));
        then(analysisClient).should().analyzeAuthorship(any(AuthorshipRequest.class));
    }

    @Test
    void rerunSupersedesOpenFindingsAndKeepsHistory() throws Exception {
        Cohort cohort = cohort();
        stubSuccess();
        String url = "/api/exams/" + cohort.exam().getId() + "/analysis-runs";

        mvc.perform(post(url).header("Authorization", bearer(cohort.owner()))).andExpect(status().isOk());
        mvc.perform(post(url).header("Authorization", bearer(cohort.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.findingsCreated").value(2));

        assertThat(findingRepository.countByExamIdAndStatus(cohort.exam().getId(), FindingStatus.OPEN))
                .isEqualTo(2);
        assertThat(findingRepository.countByExamIdAndStatus(cohort.exam().getId(), FindingStatus.SUPERSEDED))
                .isEqualTo(2);
        assertThat(analysisRunRepository.count()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void runWithoutSubmittedAttemptsIsRejected() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "EMPTY-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.OPEN);

        mvc.perform(post("/api/exams/" + exam.getId() + "/analysis-runs")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isConflict());
    }

    @Test
    void failingAnalysisClientMarksRunFailedAndWritesAudit() throws Exception {
        Cohort cohort = cohort();
        given(analysisClient.analyzePairs(any(PairAnalysisRequest.class)))
                .willThrow(new IllegalStateException("analysis service unavailable"));

        mvc.perform(post("/api/exams/" + cohort.exam().getId() + "/analysis-runs")
                        .header("Authorization", bearer(cohort.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.error").value("analysis service unavailable"));

        mvc.perform(get("/api/exams/" + cohort.exam().getId() + "/audit")
                        .header("Authorization", bearer(cohort.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.action == 'ANALYSIS_FAILED')]").exists());
    }

    @Test
    void reviewerCannotStartAnalysis() throws Exception {
        User reviewer = staff(Role.REVIEWER);
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "NOAUTH-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.OPEN);

        mvc.perform(post("/api/exams/" + exam.getId() + "/analysis-runs")
                        .header("Authorization", bearer(reviewer))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }
}
