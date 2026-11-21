package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.IntegritySignalRequest;
import com.examguard.attempt.AttemptDtos.IntegritySignalResponse;
import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import com.examguard.domain.IntegrityEvent;
import com.examguard.domain.IntegritySignal;
import com.examguard.grading.GradingService;
import com.examguard.repo.AttemptRepository;
import com.examguard.repo.IntegrityEventRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

@Service
public class IntegrityService {

    private static final String TERMINATION_REASON = "FOCUS_LOSS_LIMIT";

    private final AttemptRepository attemptRepository;
    private final IntegrityEventRepository integrityEventRepository;
    private final AccessService accessService;
    private final AttemptStateMachine stateMachine;
    private final GradingService gradingService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;
    private final EntityManager entityManager;

    public IntegrityService(
            AttemptRepository attemptRepository,
            IntegrityEventRepository integrityEventRepository,
            AccessService accessService,
            AttemptStateMachine stateMachine,
            GradingService gradingService,
            AuditService auditService,
            ObjectMapper objectMapper,
            EntityManager entityManager) {
        this.attemptRepository = attemptRepository;
        this.integrityEventRepository = integrityEventRepository;
        this.accessService = accessService;
        this.stateMachine = stateMachine;
        this.gradingService = gradingService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
        this.entityManager = entityManager;
    }

    @Transactional
    public IntegritySignalResponse recordSignal(Authentication auth, Long attemptId,
                                                IntegritySignalRequest request) {
        // Lock before any plain read: under REPEATABLE READ the snapshot must be taken after the
        // row lock, otherwise a concurrent FOCUS_RETURN would not see the just-committed FOCUS_LOSS
        // and its INSERT would collide with the unique (attempt_id, episode_key) key.
        Attempt attempt = attemptRepository.findByIdForUpdate(attemptId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attempt not found"));
        accessService.requireAttemptOwner(auth, attempt);

        String episodeKey = request.episodeKey().trim();
        if (integrityEventRepository.existsByAttemptIdAndEpisodeKey(attemptId, episodeKey)) {
            return response(attempt);
        }

        IntegrityEvent event = new IntegrityEvent();
        event.setAttempt(attempt);
        event.setEpisodeKey(episodeKey);
        event.setSignal(request.signal());
        event.setOccurredAt(request.occurredAt());
        event.setReceivedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
        event.setClientSeq(request.clientSeq());
        event.setMetadataJson(metadataJson(request.metadata()));

        if (attempt.getStatus() == AttemptStatus.IN_PROGRESS && request.signal() == IntegritySignal.FOCUS_LOSS) {
            // Atomic SQL increment, then reload: an entity save here would be last-write-wins
            // against any transaction that read the attempt before this one committed.
            attemptRepository.incrementStrikeCount(attemptId);
            entityManager.refresh(attempt);
            event.setStrikeIndex(attempt.getStrikeCount());
            integrityEventRepository.save(event);

            if (attempt.getStrikeCount() >= attempt.getMaxStrikes()) {
                terminate(attempt);
            }
            return response(attempt);
        }

        integrityEventRepository.save(event);
        return response(attempt);
    }

    private void terminate(Attempt attempt) {
        stateMachine.transition(attempt, AttemptStatus.TERMINATED);
        attempt.setTerminatedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
        attempt.setTerminationReason(TERMINATION_REASON);
        attemptRepository.save(attempt);

        gradingService.autoGrade(attempt);
        auditService.record(attempt.getStudentUser(), attempt.getExam().getId(), "ATTEMPT_TERMINATED",
                "ATTEMPT", attempt.getId(),
                Map.of("strikeCount", attempt.getStrikeCount(), "reason", TERMINATION_REASON));
    }

    private IntegritySignalResponse response(Attempt attempt) {
        return new IntegritySignalResponse(
                attempt.getStrikeCount() == null ? 0 : attempt.getStrikeCount(),
                attempt.getMaxStrikes(),
                attempt.getStatus() == AttemptStatus.TERMINATED,
                attempt.getStatus().name());
    }

    private String metadataJson(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Signal metadata is not serialisable");
        }
    }
}
