package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.AnswerView;
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
import com.examguard.dto.CommonDtos.ExamQuestionView;
import com.examguard.repo.AnswerRevisionRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.CandidateRepository;
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
    private final JwtService jwtService;
    private final AuditService auditService;

    public JoinService(
            ExamRepository examRepository,
            CandidateRepository candidateRepository,
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository,
            AnswerRevisionRepository revisionRepository,
            JwtService jwtService,
            AuditService auditService) {
        this.examRepository = examRepository;
        this.candidateRepository = candidateRepository;
        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
        this.revisionRepository = revisionRepository;
        this.jwtService = jwtService;
        this.auditService = auditService;
    }

    @Transactional
    public JoinResponse join(JoinRequest request) {
        Exam exam = examRepository.findByCodeIgnoreCase(request.examCode().trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exam code not recognised"));
        if (exam.getStatus() != ExamStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This exam is not open for participants");
        }

        Candidate candidate = resolveCandidate(exam, request.candidateCode());
        Attempt attempt = resolveAttempt(exam, candidate);
        if (attempt.getStatus() == AttemptStatus.SUBMITTED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This attempt has already been submitted");
        }
        if (attempt.getStatus() == AttemptStatus.EXPIRED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This attempt has expired");
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

    private Candidate resolveCandidate(Exam exam, String rawCode) {
        String code = rawCode.trim();
        if (code.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Candidate code is required");
        }
        return candidateRepository.findByExamIdAndCodeIgnoreCase(exam.getId(), code)
                .orElseGet(() -> createCandidate(exam, code));
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

    private Attempt resolveAttempt(Exam exam, Candidate candidate) {
        return attemptRepository.findByExamIdAndCandidateId(exam.getId(), candidate.getId())
                .orElseGet(() -> createAttempt(exam, candidate));
    }

    private Attempt createAttempt(Exam exam, Candidate candidate) {
        Attempt attempt = new Attempt();
        attempt.setExam(exam);
        attempt.setCandidate(candidate);
        attempt.setStatus(AttemptStatus.IN_PROGRESS);
        attempt.setStartedAt(Instant.now());
        attempt.setLastSeenAt(Instant.now());
        return attemptRepository.save(attempt);
    }

    ExamForAttempt examForAttempt(Exam exam) {
        List<ExamQuestionView> questions = questionRepository
                .findByExamIdOrderByOrderIndexAsc(exam.getId()).stream()
                .map(question -> new ExamQuestionView(
                        question.getId(), question.getOrderIndex(), question.getPrompt(), question.getMaxWords()))
                .toList();
        return new ExamForAttempt(exam.getId(), exam.getCode(), exam.getTitle(),
                exam.getDurationMinutes(), questions);
    }

    List<AnswerView> latestAnswers(Attempt attempt) {
        Map<Long, AnswerView> latest = new HashMap<>();
        for (AnswerRevision revision : revisionRepository
                .findByAttemptIdOrderByQuestionIdAscRevisionNoAsc(attempt.getId())) {
            AnswerView view = new AnswerView(revision.getQuestion().getId(), revision.getText(),
                    revision.getRevisionNo(), revision.getSavedAt());
            latest.put(revision.getQuestion().getId(), view);
        }
        List<Question> questions = questionRepository.findByExamIdOrderByOrderIndexAsc(attempt.getExam().getId());
        List<AnswerView> ordered = new ArrayList<>();
        for (Question question : questions) {
            AnswerView view = latest.get(question.getId());
            ordered.add(view != null ? view : new AnswerView(question.getId(), "", 0, null));
        }
        return ordered;
    }
}
