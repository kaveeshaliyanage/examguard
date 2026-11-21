package com.examguard.analysis;

import com.examguard.analysis.AnalysisPayloadBuilder.Payloads;
import com.examguard.analysis.FindingViewDtos.AnalysisRunView;
import com.examguard.domain.AnalysisRun;
import com.examguard.domain.AnalysisStatus;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.Exam;
import com.examguard.domain.ExamStatus;
import com.examguard.domain.User;
import com.examguard.dto.AnalysisDtos.AnalysisResponse;
import com.examguard.dto.AnalysisDtos.AuthorshipResponse;
import com.examguard.dto.AnalysisDtos.FindingResult;
import com.examguard.repo.AnalysisRunRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.FindingRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AnalysisClient;
import com.examguard.service.AuditService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * Runs the two analyses and persists the result. The HTTP call to the analysis service happens
 * outside a database transaction; persistence is a separate atomic step so a partial run never
 * looks complete.
 */
@Service
public class AnalysisService {

    private static final Logger log = LoggerFactory.getLogger(AnalysisService.class);
    private static final String DEFAULT_MODEL_VERSION = "rules-1.0";
    private static final int MAX_ERROR_LENGTH = 4000;

    private final ExamRepository examRepository;
    private final AttemptRepository attemptRepository;
    private final AnalysisRunRepository runRepository;
    private final FindingRepository findingRepository;
    private final AnalysisClient analysisClient;
    private final AnalysisPayloadBuilder payloadBuilder;
    private final AnalysisPersistence persistence;
    private final AccessService accessService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transaction;

    public AnalysisService(
            ExamRepository examRepository,
            AttemptRepository attemptRepository,
            AnalysisRunRepository runRepository,
            FindingRepository findingRepository,
            AnalysisClient analysisClient,
            AnalysisPayloadBuilder payloadBuilder,
            AnalysisPersistence persistence,
            AccessService accessService,
            AuditService auditService,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager) {
        this.examRepository = examRepository;
        this.attemptRepository = attemptRepository;
        this.runRepository = runRepository;
        this.findingRepository = findingRepository;
        this.analysisClient = analysisClient;
        this.payloadBuilder = payloadBuilder;
        this.persistence = persistence;
        this.accessService = accessService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public AnalysisRunView run(Authentication auth, Long examId) {
        accessService.requireExamOwner(auth, examId);
        Exam exam = findExam(examId);
        requireAnalysisPreconditions(exam);

        User actor = accessService.currentUser(auth);
        AnalysisRun run = transaction.execute(status -> createRun(exam, actor));
        auditService.record(actor, examId, "ANALYSIS_STARTED", "ANALYSIS_RUN", run.getId(), Map.of());

        try {
            AnalysisRunView view = execute(examId, run.getId(), payloadBuilder.build(exam, DEFAULT_MODEL_VERSION));
            auditService.record(actor, examId, "ANALYSIS_COMPLETED", "ANALYSIS_RUN", run.getId(),
                    Map.of("findingsCreated", view.findingsCreated()));
            return view;
        } catch (RuntimeException ex) {
            log.warn("Analysis run {} failed: {}", run.getId(), ex.getMessage());
            markFailed(run.getId(), ex);
            auditService.record(actor, examId, "ANALYSIS_FAILED", "ANALYSIS_RUN", run.getId(),
                    Map.of("error", safeMessage(ex)));
            return view(run.getId());
        }
    }

    public List<AnalysisRunView> listRuns(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        return runRepository.findByExamIdOrderByStartedAtDesc(examId).stream()
                .map(run -> toView(run, findingRepository.countByAnalysisRunId(run.getId())))
                .toList();
    }

    private AnalysisRunView execute(Long examId, Long runId, Payloads payloads) {
        String inputHash = hash(payloads);
        transaction.execute(status -> markRunning(runId, inputHash));

        AnalysisResponse pairs = analysisClient.analyzePairs(payloads.pairs());
        AnalysisResponse incidents = analysisClient.analyzeIncidents(payloads.incidents());
        List<FindingResult> findings = new ArrayList<>(pairs.findings());
        findings.addAll(incidents.findings());
        AuthorshipResponse authorship = analysisClient.analyzeAuthorship(payloads.authorship());
        if (authorship != null && authorship.findings() != null) {
            authorship.findings().stream()
                    .map(AuthorshipPolicy::toFinding)
                    .forEach(findings::add);
        }
        String modelVersion = pairs.modelVersion() == null ? DEFAULT_MODEL_VERSION : pairs.modelVersion();

        Integer created = transaction.execute(status ->
                complete(examId, runId, findings, modelVersion));
        return view(runId, created == null ? 0 : created);
    }

    private int complete(Long examId, Long runId, List<FindingResult> findings, String modelVersion) {
        Exam exam = findExam(examId);
        AnalysisRun run = findRun(runId);
        int created = persistence.replaceFindings(exam, run, findings);
        run.setStatus(AnalysisStatus.COMPLETED);
        run.setModelVersion(modelVersion);
        run.setFinishedAt(Instant.now());
        runRepository.save(run);
        if (exam.getStatus() == ExamStatus.CLOSED) {
            exam.setStatus(ExamStatus.ANALYSED);
            examRepository.save(exam);
        }
        return created;
    }

    private AnalysisRun createRun(Exam exam, User actor) {
        AnalysisRun run = new AnalysisRun();
        run.setExam(exam);
        run.setStatus(AnalysisStatus.PENDING);
        run.setCreatedBy(actor);
        run.setStartedAt(Instant.now());
        return runRepository.save(run);
    }

    private Void markRunning(Long runId, String inputHash) {
        AnalysisRun run = findRun(runId);
        run.setStatus(AnalysisStatus.RUNNING);
        run.setInputHash(inputHash);
        runRepository.save(run);
        return null;
    }

    private void markFailed(Long runId, RuntimeException error) {
        transaction.execute(status -> {
            AnalysisRun run = findRun(runId);
            run.setStatus(AnalysisStatus.FAILED);
            run.setError(safeMessage(error));
            run.setFinishedAt(Instant.now());
            runRepository.save(run);
            return null;
        });
    }

    private void requireAnalysisPreconditions(Exam exam) {
        long submitted = attemptRepository.countByExamIdAndStatus(exam.getId(), AttemptStatus.SUBMITTED);
        if (submitted == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No submitted attempts to analyse");
        }
        boolean inFlight = !runRepository.findByExamIdAndStatusIn(
                exam.getId(), List.of(AnalysisStatus.PENDING, AnalysisStatus.RUNNING)).isEmpty();
        if (inFlight) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An analysis run is already in progress");
        }
    }

    private String hash(Payloads payloads) {
        try {
            String canonical = objectMapper.writeValueAsString(payloads.pairs())
                    + "\n" + objectMapper.writeValueAsString(payloads.incidents())
                    + "\n" + objectMapper.writeValueAsString(payloads.authorship());
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (JsonProcessingException | NoSuchAlgorithmException ex) {
            throw new IllegalStateException("Cannot hash analysis payload", ex);
        }
    }

    private AnalysisRunView view(Long runId) {
        AnalysisRun run = findRun(runId);
        return toView(run, findingRepository.countByAnalysisRunId(runId));
    }

    private AnalysisRunView view(Long runId, long findingsCreated) {
        return toView(findRun(runId), findingsCreated);
    }

    private AnalysisRunView toView(AnalysisRun run, long findingsCreated) {
        return new AnalysisRunView(
                run.getId(),
                run.getStatus(),
                run.getModelVersion(),
                run.getInputHash(),
                run.getError(),
                findingsCreated,
                run.getStartedAt(),
                run.getFinishedAt());
    }

    private String safeMessage(RuntimeException error) {
        String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        return message.length() <= MAX_ERROR_LENGTH ? message : message.substring(0, MAX_ERROR_LENGTH);
    }

    private Exam findExam(Long examId) {
        return examRepository.findById(examId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exam not found"));
    }

    private AnalysisRun findRun(Long runId) {
        return runRepository.findById(runId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Analysis run not found"));
    }
}
