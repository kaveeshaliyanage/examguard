package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.AnswerView;
import com.examguard.attempt.AttemptDtos.AttemptQuestionView;
import com.examguard.attempt.AttemptDtos.ExamForAttempt;
import com.examguard.attempt.AttemptDtos.JoinRequest;
import com.examguard.attempt.AttemptDtos.JoinResponse;
import com.examguard.config.JwtService;
import com.examguard.domain.AnswerRevision;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Candidate;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.Question;
import com.examguard.domain.User;
import com.examguard.exam.QuestionJson;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.CandidateRepository;
import com.examguard.repo.ExamEnrollmentRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.QuestionRepository;
import com.examguard.service.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class JoinService {

    private final ExamRepository examRepository;
    private final CandidateRepository candidateRepository;
    private final AttemptRepository attemptRepository;
    private final QuestionRepository questionRepository;
    private final AnswerRevisionRepository revisionRepository;
    private final ExamEnrollmentRepository enrollmentRepository;
    private final JwtService jwtService;
    private final AuditService auditService;
    private final QuestionJson questionJson;
    private final AnswerJson answerJson;

    public JoinService(
            ExamRepository examRepository,
            CandidateRepository candidateRepository,
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository,
            AnswerRevisionRepository revisionRepository,
            ExamEnrollmentRepository enrollmentRepository,
            JwtService jwtService,
            AuditService auditService,
            QuestionJson questionJson,
            AnswerJson answerJson) {
        this.examRepository = examRepository;
        this.candidateRepository = candidateRepository;
        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
        this.revisionRepository = revisionRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.jwtService = jwtService;
        this.auditService = auditService;
        this.questionJson = questionJson;
        this.answerJson = answerJson;
    }

    @Transactional
    public JoinResponse join(JoinRequest request) {
        return join(request, null);
    }

    @Transactional
    public JoinResponse join(JoinRequest request, User student) {
        Exam exam = examRepository.findByCodeIgnoreCase(request.examCode().trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exam code not recognised"));
        if (exam.getStatus() != ExamStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This exam is not open for participants");
        }

        String candidateCode = request.candidateCode().trim();
        if (candidateCode.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Candidate code is required");
        }
        Candidate candidate = candidateRepository
                .findByExamIdAndCodeIgnoreCase(exam.getId(), candidateCode).orElse(null);
        Attempt attempt = candidate == null ? null
                : attemptRepository.findByExamIdAndCandidateId(exam.getId(), candidate.getId()).orElse(null);

        // Window and roster gate opening a new attempt only; an in-progress attempt can
        // always resume so no answers are stranded.
        if (attempt == null) {
            enforceJoinWindow(exam);
            enforceRoster(exam, student);
        }
        if (candidate == null) {
            candidate = createCandidate(exam, candidateCode);
        }
        if (attempt == null) {
            attempt = createAttempt(exam, candidate);
        }
        if (attempt.getStatus() == AttemptStatus.SUBMITTED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This attempt has already been submitted");
        }
        if (attempt.getStatus() == AttemptStatus.EXPIRED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This attempt has expired");
        }
        if (attempt.getStatus() == AttemptStatus.TERMINATED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This attempt has been terminated");
        }
        if (student != null) {
            linkStudent(attempt, student);
        }
        attempt.setLastSeenAt(Instant.now());
        attemptRepository.save(attempt);
        return new JoinResponse(
                attempt.getId(),
                jwtService.issueAttemptToken(attempt),
                jwtService.issueAttemptToken(attempt),
                attempt.getStatus().name(),
                attempt.getStartedAt(),
                attempt.getSubmittedAt(),
                Instant.now(),
                attempt.isExtensionConnected(),
                examForAttempt(exam),
                latestAnswers(attempt));
    }

    private void linkStudent(Attempt attempt, User student) {
        User current = attempt.getStudentUser();
        if (current != null) {
            if (!current.getId().equals(student.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This attempt is linked to another student account");
            }
            return;
        }
        attempt.setStudentUser(student);
        auditService.record(student, attempt.getExam().getId(), "ATTEMPT_LINKED", "ATTEMPT", attempt.getId(),
                Map.of("userId", student.getId(), "candidateCode", attempt.getCandidate().getCode()));
    }

    private Candidate createCandidate(Exam exam, String code) {
        Candidate candidate = new Candidate();
        candidate.setExam(exam);
        candidate.setCode(code);
        candidate = candidateRepository.save(candidate);
        auditService.record(null, exam.getId(), "CANDIDATE_ADDED", "CANDIDATE", candidate.getId(),
                Map.of("code", code, "source", "public_join"));
        return candidate;
    }

    private void enforceJoinWindow(Exam exam) {
        Instant now = Instant.now();
        if (exam.getOpensAt() != null && now.isBefore(exam.getOpensAt())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This exam opens at " + exam.getOpensAt());
        }
        if (exam.getClosesAt() != null && now.isAfter(exam.getClosesAt())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This exam closed at " + exam.getClosesAt());
        }
    }

    private void enforceRoster(Exam exam, User student) {
        if (enrollmentRepository.countByExamId(exam.getId()) == 0) {
            return;
        }
        if (student == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This exam has a participant list. Sign in with your enrolled email to join.");
        }
        if (!enrollmentRepository.existsByExamIdAndEmailIgnoreCase(exam.getId(), student.getEmail())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Your account is not on the participant list for this exam");
        }
    }

    private Attempt createAttempt(Exam exam, Candidate candidate) {
        Attempt attempt = new Attempt();
        attempt.setExam(exam);
        attempt.setCandidate(candidate);
        attempt.setStatus(AttemptStatus.IN_PROGRESS);
        attempt.setStartedAt(Instant.now());
        attempt.setLastSeenAt(Instant.now());
        attempt.setMaxStrikes(exam.getMaxStrikes());
        return attemptRepository.save(attempt);
    }

    ExamForAttempt examForAttempt(Exam exam) {
        List<AttemptQuestionView> questions = questionRepository
                .findByExamIdOrderByOrderIndexAsc(exam.getId()).stream()
                .map(question -> new AttemptQuestionView(
                        question.getId(),
                        question.getOrderIndex(),
                        question.getPrompt(),
                        question.getType(),
                        question.getPoints(),
                        question.getMaxWords(),
                        questionJson.content(question)))
                .toList();
        return new ExamForAttempt(exam.getId(), exam.getCode(), exam.getTitle(),
                exam.getDurationMinutes(), exam.getInstructions(), exam.getMaxStrikes(), questions);
    }

    List<AnswerView> latestAnswers(Attempt attempt) {
        Map<Long, AnswerView> latest = new HashMap<>();
        for (AnswerRevision revision : revisionRepository
                .findByAttemptIdOrderByQuestionIdAscRevisionNoAsc(attempt.getId())) {
            AnswerView view = new AnswerView(revision.getQuestion().getId(), revision.getText(),
                    answerJson.read(revision.getSelectedOptions()),
                    revision.getRevisionNo(), revision.getSavedAt());
            latest.put(revision.getQuestion().getId(), view);
        }
        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(attempt.getExam().getId());
        List<AnswerView> ordered = new ArrayList<>();
        for (Question question : questions) {
            AnswerView view = latest.get(question.getId());
            ordered.add(view != null ? view : new AnswerView(question.getId(), "", List.of(), 0, null));
        }
        return ordered;
    }
}
