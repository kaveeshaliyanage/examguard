package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.AttemptState;
import com.examguard.attempt.AttemptDtos.CoverageView;
import com.examguard.attempt.AttemptDtos.EventBatchRequest;
import com.examguard.attempt.AttemptDtos.EventBatchResponse;
import com.examguard.attempt.AttemptDtos.HeartbeatRequest;
import com.examguard.attempt.AttemptDtos.SaveAnswerRequest;
import com.examguard.attempt.AttemptDtos.SaveAnswerResponse;
import com.examguard.attempt.AttemptDtos.SubmitRequest;
import com.examguard.attempt.AttemptDtos.SubmitResponse;
import jakarta.validation.Valid;
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

    private final AttemptService attemptService;
    private final IngestionService ingestionService;

    public AttemptController(AttemptService attemptService, IngestionService ingestionService) {
        this.attemptService = attemptService;
        this.ingestionService = ingestionService;
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
        return attemptService.submit(authentication, attemptId,
                request == null ? new SubmitRequest(null) : request);
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
