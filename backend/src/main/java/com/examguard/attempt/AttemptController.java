package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.AttemptState;
import com.examguard.attempt.AttemptDtos.CoverageView;
import com.examguard.attempt.AttemptDtos.EventBatchRequest;
import com.examguard.attempt.AttemptDtos.EventBatchResponse;
import com.examguard.attempt.AttemptDtos.HeartbeatRequest;
import com.examguard.attempt.AttemptDtos.IntegritySignalRequest;
import com.examguard.attempt.AttemptDtos.IntegritySignalResponse;
import com.examguard.attempt.AttemptDtos.SaveAnswerRequest;
import com.examguard.attempt.AttemptDtos.SaveAnswerResponse;
import com.examguard.attempt.AttemptDtos.SubmitRequest;
import com.examguard.attempt.AttemptDtos.SubmitResponse;
import com.examguard.judge.CodeJudgeService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/attempts/{attemptId}")
public class AttemptController {

    private static final Logger log = LoggerFactory.getLogger(AttemptController.class);

    private final AttemptService attemptService;
    private final IngestionService ingestionService;
    private final IntegrityService integrityService;
    private final CodeJudgeService codeJudgeService;

    public AttemptController(AttemptService attemptService,
                             IngestionService ingestionService,
                             IntegrityService integrityService,
                             CodeJudgeService codeJudgeService) {
        this.attemptService = attemptService;
        this.ingestionService = ingestionService;
        this.integrityService = integrityService;
        this.codeJudgeService = codeJudgeService;
    }

    @GetMapping
    public AttemptState state(Authentication authentication, @PathVariable Long attemptId) {
        return attemptService.state(authentication, attemptId);
    }

    @PutMapping("/answers/{questionId}")
    public SaveAnswerResponse saveAnswer(
            Authentication authentication,
            @PathVariable Long attemptId,
            @PathVariable Long questionId,
            @Valid @RequestBody SaveAnswerRequest request) {
        return attemptService.saveAnswer(authentication, attemptId, questionId, request);
    }

    @PostMapping("/submit")
    public SubmitResponse submit(
            Authentication authentication,
            @PathVariable Long attemptId,
            @RequestBody(required = false) SubmitRequest request) {
        SubmitResponse response = attemptService.submit(authentication, attemptId,
                request == null ? new SubmitRequest(null) : request);
        try {
            codeJudgeService.judgeAttempt(attemptId);
        } catch (RuntimeException ex) {
            // Submission must still succeed; the lecturer can re-run judging from the exam.
            log.warn("Code judging after submit failed for attempt {}: {}", attemptId, ex.getMessage());
        }
        return response;
    }

    @PostMapping("/integrity/signals")
    public IntegritySignalResponse signal(
            Authentication authentication,
            @PathVariable Long attemptId,
            @Valid @RequestBody IntegritySignalRequest request) {
        return integrityService.recordSignal(authentication, attemptId, request);
    }

    @PostMapping("/events")
    public EventBatchResponse events(
            Authentication authentication,
            @PathVariable Long attemptId,
            @Valid @RequestBody EventBatchRequest request) {
        return ingestionService.ingest(authentication, attemptId, request);
    }

    @PostMapping("/heartbeat")
    public CoverageView heartbeat(
            Authentication authentication,
            @PathVariable Long attemptId,
            @Valid @RequestBody HeartbeatRequest request) {
        return ingestionService.heartbeat(authentication, attemptId, request);
    }
}
