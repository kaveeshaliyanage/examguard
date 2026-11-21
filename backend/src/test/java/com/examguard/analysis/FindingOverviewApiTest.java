package com.examguard.analysis;

import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.FindingType;
import com.examguard.domain.PriorityBand;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.support.ApiTestBase;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FindingOverviewApiTest extends ApiTestBase {

    private record Case(Exam exam, User owner, Candidate candidate) {
    }

    private Case scenario(double score, String prefix) {
        User owner = staff(Role.LECTURER);
        Exam exam = exam(owner, prefix + "-" + UUID.randomUUID().toString().substring(0, 8),
                ExamStatus.ANALYSED);
        Candidate candidate = candidate(exam, prefix + "-CAND");
        finding(exam, candidate, null, score);
        return new Case(exam, owner, candidate);
    }

    @Test
    void adminSeesFindingsAcrossExamsWhileLecturersOnlySeeTheirOwn() throws Exception {
        Case mine = scenario(62.0, "OWA");
        Case other = scenario(22.0, "OWB");
        User admin = staff(Role.ADMIN);

        mvc.perform(get("/api/findings?limit=200").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.candidateA == '" + mine.candidate().getCode() + "')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.candidateA == '" + other.candidate().getCode() + "')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.candidateA == '" + mine.candidate().getCode() + "')].exam.code",
                        hasItem(mine.exam().getCode())));

        mvc.perform(get("/api/findings?limit=200").header("Authorization", bearer(mine.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.candidateA == '" + mine.candidate().getCode() + "')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.candidateA == '" + other.candidate().getCode() + "')]").isEmpty());
    }

    @Test
    void bandAndTypeFiltersNarrowTheQueue() throws Exception {
        Case high = scenario(62.0, "FLA");
        Case pair = scenario(90.0, "FLC");
        Candidate partner = candidate(pair.exam(), "FLC-PARTNER");
        finding(pair.exam(), pair.candidate(), partner, 88.0);
        User admin = staff(Role.ADMIN);

        mvc.perform(get("/api/findings?band=HIGH&limit=200").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].priorityBand", everyItem(is("HIGH"))))
                .andExpect(jsonPath("$[?(@.candidateA == '" + high.candidate().getCode() + "')]").isNotEmpty());

        mvc.perform(get("/api/findings?type=CANDIDATE_PAIR&limit=200")
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].type", everyItem(is("CANDIDATE_PAIR"))))
                .andExpect(jsonPath("$[?(@.candidateA == '" + pair.candidate().getCode() + "')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.candidateA == '" + high.candidate().getCode() + "')]").isEmpty());
    }

    @Test
    void examFilterIsScopedLikeTheExamEndpoints() throws Exception {
        Case mine = scenario(62.0, "FLX");
        Case other = scenario(62.0, "FLY");

        mvc.perform(get("/api/findings?examId=" + mine.exam().getId())
                        .header("Authorization", bearer(mine.owner())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].exam.id").value(mine.exam().getId()))
                .andExpect(jsonPath("$[0].priorityBand").value(PriorityBand.HIGH.name()));

        mvc.perform(get("/api/findings?examId=" + other.exam().getId())
                        .header("Authorization", bearer(mine.owner())))
                .andExpect(status().isForbidden());
    }

    @Test
    void overviewReturnsStatusSoReviewersCanSeeOpenWork() throws Exception {
        Case mine = scenario(80.0, "FLZ");
        User admin = staff(Role.ADMIN);

        mvc.perform(get("/api/findings?examId=" + mine.exam().getId() + "&status=OPEN")
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("OPEN"))
                .andExpect(jsonPath("$[0].type").value(FindingType.CANDIDATE_INCIDENT.name()))
                .andExpect(jsonPath("$[0].evidenceCount").isNumber());
    }
}
