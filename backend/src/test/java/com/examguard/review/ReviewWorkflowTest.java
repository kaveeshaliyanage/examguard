package com.examguard.review;

import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Finding;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.PermissionLevel;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReviewWorkflowTest extends ApiTestBase {

    private record Case(Exam exam, User owner, Finding finding) {
    }

    private Case scenario() {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, "REV-" + UUID.randomUUID().toString().substring(0, 8), ExamStatus.ANALYSED);
        Candidate first = candidate(exam, "REV-A");
        Candidate second = candidate(exam, "REV-B");
        Finding finding = finding(exam, first, second, 61.0);
        return new Case(exam, owner, finding);
    }

    private String decision(String outcome, String rationale) {
        try {
            return json.writeValueAsString(Map.of("outcome", outcome, "rationale", rationale));
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    @Test
    void reviewerDecisionIsRecordedOnFindingAndInAudit() throws Exception {
        Case scenario = scenario();
        User reviewer = staff(Role.REVIEWER);
        grant(scenario.exam(), reviewer, PermissionLevel.REVIEWER);

        mvc.perform(post("/api/findings/" + scenario.finding().getId() + "/decisions")
                        .header("Authorization", bearer(reviewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("CONFIRMED",
                                "Evidence reviewed with both candidates present.")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("CONFIRMED"))
                .andExpect(jsonPath("$.reviewerName").value(reviewer.getDisplayName()));

        Finding updated = findingRepository.findById(scenario.finding().getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(FindingStatus.CONFIRMED);
        assertThat(decisionRepository.findByFindingIdOrderByCreatedAtAsc(updated.getId())).hasSize(1);

        mvc.perform(get("/api/findings/" + updated.getId())
                        .header("Authorization", bearer(scenario.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decisions[0].rationale")
                        .value("Evidence reviewed with both candidates present."));

        mvc.perform(get("/api/exams/" + scenario.exam().getId() + "/audit")
                        .header("Authorization", bearer(scenario.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.action == 'FINDING_DECISION')]").exists());
    }

    @Test
    void lecturerWithoutPermissionCannotDecide() throws Exception {
        Case scenario = scenario();
        User outsider = staff(Role.LECTURER);

        mvc.perform(post("/api/findings/" + scenario.finding().getId() + "/decisions")
                        .header("Authorization", bearer(outsider))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("DISMISSED", "No permission to decide this finding.")))
                .andExpect(status().isForbidden());

        assertThat(decisionRepository.countByFindingId(scenario.finding().getId())).isZero();
    }

    @Test
    void rationaleIsRequiredAndMustBeSubstantive() throws Exception {
        Case scenario = scenario();

        mvc.perform(post("/api/findings/" + scenario.finding().getId() + "/decisions")
                        .header("Authorization", bearer(scenario.owner()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("CONFIRMED", "too short")))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/findings/" + scenario.finding().getId() + "/decisions")
                        .header("Authorization", bearer(scenario.owner()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"outcome\":\"CONFIRMED\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void supersededFindingCannotBeDecided() throws Exception {
        Case scenario = scenario();
        Finding superseded = scenario.finding();
        superseded.setStatus(FindingStatus.SUPERSEDED);
        findingRepository.save(superseded);

        mvc.perform(post("/api/findings/" + superseded.getId() + "/decisions")
                        .header("Authorization", bearer(scenario.owner()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("CONFIRMED", "This finding was replaced by a rerun.")))
                .andExpect(status().isConflict());
    }
}
