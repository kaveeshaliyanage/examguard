package com.examguard.analysis;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.EvidenceSource;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Finding;
import com.examguard.domain.FindingType;
import com.examguard.domain.Question;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.dto.AnalysisDtos.AnalysisResponse;
import com.examguard.dto.AnalysisDtos.AuthorshipFindingResult;
import com.examguard.dto.AnalysisDtos.AuthorshipRequest;
import com.examguard.dto.AnalysisDtos.AuthorshipResponse;
import com.examguard.dto.AnalysisDtos.EvidenceResult;
import com.examguard.dto.AnalysisDtos.IncidentAnalysisRequest;
import com.examguard.dto.AnalysisDtos.PairAnalysisRequest;
import com.examguard.domain.EvidenceItem;
import com.examguard.service.AnalysisClient;
import com.examguard.support.ApiTestBase;
import org.junit.jupiter.api.Test;
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

class AuthorshipAnalysisTest extends ApiTestBase {

    @MockitoBean
    private AnalysisClient analysisClient;

    @Test
    void authorshipScoreIsCappedBelowHighAndContextShowsOnlyOneCandidate() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "AUTH-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.OPEN);
        Question question = question(exam, 1);
        Candidate candidate = candidate(exam, "AUTH-A");
        Attempt attempt = attempt(exam, candidate, AttemptStatus.SUBMITTED);
        revision(attempt, question, 1,
                "Machine-like prose with uniform sentence lengths and no contractions at all.",
                Instant.now().minusSeconds(600));

        given(analysisClient.analyzePairs(any(PairAnalysisRequest.class)))
                .willReturn(new AnalysisResponse("mock-1.0", List.of(), Map.of()));
        given(analysisClient.analyzeIncidents(any(IncidentAnalysisRequest.class)))
                .willReturn(new AnalysisResponse("mock-1.0", List.of(), Map.of()));
        given(analysisClient.analyzeAuthorship(any(AuthorshipRequest.class)))
                .willReturn(new AuthorshipResponse("mock-1.0", List.of(new AuthorshipFindingResult(
                        "AUTH-A",
                        question.getId(),
                        88.0,
                        "CRITICAL",
                        0.91,
                        "Stylometric review flag: uniform sentence rhythm.",
                        Map.of("sentenceLengthVariance", 1.2, "contractionRate", 0.0),
                        List.of(new EvidenceResult("AUTHORSHIP", 24.0, question.getId(),
                                "Sentence rhythm is unusually uniform.", Map.of("signal", "sentenceRhythm"))))),
                        Map.of("scoreCap", 54.0)));

        mvc.perform(post("/api/exams/" + exam.getId() + "/analysis-runs")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.findingsCreated").value(1));

        Finding finding = findingRepository
                .findByExamIdAndTypeOrderByPriorityScoreDesc(exam.getId(), FindingType.CANDIDATE_AUTHORSHIP)
                .getFirst();
        assertThat(finding.getPriorityScore()).isEqualTo(AuthorshipPolicy.SCORE_CAP);
        assertThat(finding.getPriorityBand().name()).isEqualTo("MEDIUM");
        assertThat(finding.getCandidateB()).isNull();
        assertThat(finding.getQuestionId()).isEqualTo(question.getId());

        List<EvidenceItem> evidence = evidenceRepository.findByFindingIdOrderByWeightDesc(finding.getId());
        assertThat(evidence).isNotEmpty();
        assertThat(evidence).allSatisfy(item -> assertThat(item.getSource()).isEqualTo(EvidenceSource.AUTHORSHIP));
        assertThat(evidence)
                .anySatisfy(item -> assertThat(item.getMetadataJson()).contains("\"probability\":0.91"));

        mvc.perform(get("/api/findings/" + finding.getId()).header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("CANDIDATE_AUTHORSHIP"))
                .andExpect(jsonPath("$.priorityScore").value(54.0))
                .andExpect(jsonPath("$.priorityBand").value("MEDIUM"))
                .andExpect(jsonPath("$.pairContext.candidates.length()").value(1))
                .andExpect(jsonPath("$.pairContext.candidates[0].candidateCode").value("AUTH-A"))
                .andExpect(jsonPath("$.incidentContext").doesNotExist())
                .andExpect(jsonPath("$.summary").value(org.hamcrest.Matchers.containsString("Capped priority 54.0/100")));

        then(analysisClient).should().analyzeAuthorship(any(AuthorshipRequest.class));
    }

    @Test
    void missingAuthorshipResponseDoesNotFailTheRun() throws Exception {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "AUTH-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.OPEN);
        Question question = question(exam, 1);
        Candidate candidate = candidate(exam, "AUTH-B");
        Attempt attempt = attempt(exam, candidate, AttemptStatus.SUBMITTED);
        revision(attempt, question, 1, "Short answer.", Instant.now().minusSeconds(300));

        given(analysisClient.analyzePairs(any(PairAnalysisRequest.class)))
                .willReturn(new AnalysisResponse("mock-1.0", List.of(), Map.of()));
        given(analysisClient.analyzeIncidents(any(IncidentAnalysisRequest.class)))
                .willReturn(new AnalysisResponse("mock-1.0", List.of(), Map.of()));
        given(analysisClient.analyzeAuthorship(any(AuthorshipRequest.class))).willReturn(null);

        mvc.perform(post("/api/exams/" + exam.getId() + "/analysis-runs")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.findingsCreated").value(0));
    }

    @Test
    void capNeverExceedsMediumEvenWithoutAClientFinding() {
        assertThat(AuthorshipPolicy.cap(100.0)).isEqualTo(54.0);
        assertThat(AuthorshipPolicy.cap(-4.0)).isZero();
        assertThat(AuthorshipPolicy.band(54.0).name()).isEqualTo("MEDIUM");
        assertThat(AuthorshipPolicy.band(55.0).name()).isEqualTo("MEDIUM");
    }
}
