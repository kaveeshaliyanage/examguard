package com.examguard.dashboard;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamEnrollment;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Role;
import com.examguard.domain.User;
import com.examguard.repo.ExamEnrollmentRepository;
import com.examguard.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DashboardApiTest extends ApiTestBase {

    @Autowired
    private ExamEnrollmentRepository enrollmentRepository;

    private Exam examWithWork(User owner) {
        Exam exam = exam(owner, "DASH-" + UUID.randomUUID(), ExamStatus.OPEN);
        question(exam, 1);
        Candidate candidate = candidate(exam, "S-1");
        attempt(exam, candidate, AttemptStatus.SUBMITTED);
        finding(exam, candidate, null, 62.0);
        return exam;
    }

    @Test
    void lecturerDashboardSurfacesUngradedWorkAndFlags() throws Exception {
        User lecturer = staff(Role.LECTURER);
        Exam exam = examWithWork(lecturer);

        mvc.perform(get("/api/dashboard/lecturer")
                        .header("Authorization", bearer(lecturer))
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exams[*].code", hasItem(exam.getCode())))
                .andExpect(jsonPath("$.ungradedTotal").value(1))
                .andExpect(jsonPath("$.flaggedTotal").value(1))
                .andExpect(jsonPath("$.distribution[*].label", hasItem("0–19")))
                .andExpect(jsonPath("$.integrityTrend.length()").value(14))
                .andExpect(jsonPath("$.integrityTrend[13].focusLossSignals").value(0))
                .andExpect(jsonPath("$.bandMix[*].band", hasItem("HIGH")))
                .andExpect(jsonPath("$.bandMix[?(@.band == 'HIGH')].count", hasItem(1)))
                .andExpect(jsonPath("$.funnel[0].stage").value("Attempts"))
                .andExpect(jsonPath("$.funnel[1].stage").value("Submitted"))
                .andExpect(jsonPath("$.funnel[2].stage").value("Graded"))
                .andExpect(jsonPath("$.funnel[3].stage").value("Released"))
                .andExpect(jsonPath("$.funnel[0].count").value(1))
                .andExpect(jsonPath("$.funnel[1].count").value(1))
                .andExpect(jsonPath("$.funnel[2].count").value(0))
                .andExpect(jsonPath("$.funnel[3].count").value(0));
    }

    @Test
    void adminDashboardIsForbiddenForLecturers() throws Exception {
        User lecturer = staff(Role.LECTURER);
        mvc.perform(get("/api/dashboard/admin").header("Authorization", bearer(lecturer)))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminDashboardCountsUsersAndExams() throws Exception {
        User admin = staff(Role.ADMIN);
        exam(admin, "ADMIN-" + UUID.randomUUID(), ExamStatus.DRAFT);

        mvc.perform(get("/api/dashboard/admin")
                        .header("Authorization", bearer(admin))
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.admins").isNumber())
                .andExpect(jsonPath("$.counts.exams").isNumber())
                .andExpect(jsonPath("$.recentAudit").isArray());
    }

    @Test
    void studentDashboardRequiresAccountScope() throws Exception {
        User lecturer = staff(Role.LECTURER);
        mvc.perform(get("/api/dashboard/student").header("Authorization", bearer(lecturer)))
                .andExpect(status().isForbidden());

        User student = staff(Role.STUDENT);
        String token = "Bearer " + jwtService.issueStudentToken(student);
        Exam exam = exam(lecturer, "STU-" + UUID.randomUUID(), ExamStatus.OPEN);
        Candidate candidate = candidate(exam, "C-9");
        Attempt attempt = attempt(exam, candidate, AttemptStatus.IN_PROGRESS);
        attempt.setStudentUser(student);
        attemptRepository.save(attempt);

        mvc.perform(get("/api/dashboard/student")
                        .header("Authorization", token)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.email").value(student.getEmail()))
                .andExpect(jsonPath("$.stats.totalAttempts").value(1))
                .andExpect(jsonPath("$.attempts[0].examCode").value(exam.getCode()));
    }

    @Test
    void studentDashboardListsEnrolledExamsWithNoAttemptYet() throws Exception {
        User lecturer = staff(Role.LECTURER);
        User student = staff(Role.STUDENT);
        String token = "Bearer " + jwtService.issueStudentToken(student);

        Exam upcoming = exam(lecturer, "UP-" + UUID.randomUUID(), ExamStatus.OPEN);
        upcoming.setOpensAt(Instant.now().plus(1, ChronoUnit.HOURS));
        upcoming.setClosesAt(Instant.now().plus(3, ChronoUnit.HOURS));
        examRepository.save(upcoming);
        ExamEnrollment enrollment = new ExamEnrollment();
        enrollment.setExam(upcoming);
        enrollment.setEmail(student.getEmail());
        enrollmentRepository.save(enrollment);

        Exam joined = exam(lecturer, "JOINED-" + UUID.randomUUID(), ExamStatus.OPEN);
        Candidate joinedCandidate = candidate(joined, "S-UP");
        Attempt joinedAttempt = attempt(joined, joinedCandidate, AttemptStatus.IN_PROGRESS);
        joinedAttempt.setStudentUser(student);
        attemptRepository.save(joinedAttempt);

        mvc.perform(get("/api/dashboard/student")
                        .header("Authorization", token)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upcoming.length()").value(1))
                .andExpect(jsonPath("$.upcoming[0].examId").value(upcoming.getId()))
                .andExpect(jsonPath("$.upcoming[0].code").value(upcoming.getCode()))
                .andExpect(jsonPath("$.upcoming[0].opensAt").isNotEmpty())
                .andExpect(jsonPath("$.upcoming[0].openNow").value(false));
    }
}
