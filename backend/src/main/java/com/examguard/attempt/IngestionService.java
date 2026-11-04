package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.CoverageView;
import com.examguard.attempt.AttemptDtos.EventBatchRequest;
import com.examguard.attempt.AttemptDtos.EventBatchResponse;
import com.examguard.attempt.AttemptDtos.EventDto;
import com.examguard.attempt.AttemptDtos.HeartbeatRequest;
import com.examguard.domain.ActivityEvent;
import com.examguard.domain.Attempt;
import com.examguard.domain.EventType;
import com.examguard.repo.ActivityEventRepository;
import com.examguard.repo.AttemptRepository;
import com.examguard.service.AccessService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class IngestionService {

    private static final Duration CLOCK_ALLOWANCE = Duration.ofMinutes(5);
    private static final int MAX_METADATA_KEYS = 10;

    private final ActivityEventRepository eventRepository;
    private final AttemptRepository attemptRepository;
    private final AccessService accessService;
    private final ObjectMapper objectMapper;

    public IngestionService(
            ActivityEventRepository eventRepository,
            AttemptRepository attemptRepository,
            AccessService accessService,
            ObjectMapper objectMapper) {
        this.eventRepository = eventRepository;
        this.attemptRepository = attemptRepository;
        this.accessService = accessService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public EventBatchResponse ingest(Authentication auth, Long attemptId, EventBatchRequest batch) {
        Attempt attempt = accessService.requireAttemptOwner(auth, attemptId);
        Instant now = Instant.now();
        Instant windowStart = attempt.getStartedAt().minus(CLOCK_ALLOWANCE);
        Instant windowEnd = (attempt.getSubmittedAt() != null ? attempt.getSubmittedAt() : now)
                .plus(CLOCK_ALLOWANCE);

        int accepted = 0;
        int duplicates = 0;
        int rejected = 0;
        for (EventDto dto : batch.events()) {
            if (!isValid(dto, windowStart, windowEnd)) {
                rejected++;
                continue;
            }
            if (eventRepository.existsByAttemptIdAndClientEventId(attemptId, dto.clientEventId())) {
                duplicates++;
                continue;
            }
            save(attempt, dto, now);
            accepted++;
        }
        attemptRepository.save(attempt);
        return new EventBatchResponse(accepted, duplicates, rejected);
    }

    @Transactional
    public CoverageView heartbeat(Authentication auth, Long attemptId, HeartbeatRequest request) {
        Attempt attempt = accessService.requireAttemptOwner(auth, attemptId);
        Instant now = Instant.now();
        Instant lastSeen = sanitizeLastSeen(attempt, request.lastSeenAt(), now);
        attempt.setLastSeenAt(latest(attempt.getLastSeenAt(), lastSeen));
        if (request.extensionConnected() != null) {
            attempt.setExtensionConnected(request.extensionConnected());
        }
        attemptRepository.save(attempt);

        List<ActivityEvent> events = eventRepository.findByAttemptIdOrderByOccurredAtAsc(attemptId);
        Instant monitoringEnd = attempt.getSubmittedAt() != null ? attempt.getSubmittedAt() : now;
        CoverageCalculator.Coverage coverage = CoverageCalculator.compute(
                attempt.getStartedAt(), monitoringEnd,
                events.stream().map(ActivityEvent::getOccurredAt).toList());
        long domains = events.stream().map(ActivityEvent::getDomain).filter(Objects::nonNull).distinct().count();
        return new CoverageView(
                attempt.getStartedAt(),
                attempt.getLastSeenAt(),
                events.size(),
                domains,
                attempt.isExtensionConnected(),
                coverage.percent(),
                coverage.warning());
    }

    private void save(Attempt attempt, EventDto dto, Instant now) {
        ActivityEvent event = new ActivityEvent();
        event.setAttempt(attempt);
        event.setClientEventId(dto.clientEventId());
        event.setEventType(dto.eventType());
        event.setDomain(dto.eventType() == EventType.NAVIGATION ? DomainNormalizer.normalize(dto.domain()) : null);
        event.setOccurredAt(dto.occurredAt());
        event.setReceivedAt(now);
        event.setTabId(dto.tabId());
        event.setMetadataJson(toJson(dto.metadata()));

        eventRepository.save(event);
        attempt.setLastSeenAt(latest(attempt.getLastSeenAt(), dto.occurredAt()));
        if (dto.eventType() == EventType.EXTENSION_CONNECTED) {
            attempt.setExtensionConnected(true);
        } else if (dto.eventType() == EventType.EXTENSION_DISCONNECTED) {
            attempt.setExtensionConnected(false);
        }
    }

    private boolean isValid(EventDto dto, Instant windowStart, Instant windowEnd) {
        if (dto.occurredAt().isBefore(windowStart) || dto.occurredAt().isAfter(windowEnd)) {
            return false;
        }
        if (dto.eventType() == EventType.NAVIGATION) {
            String domain = DomainNormalizer.normalize(dto.domain());
            if (domain == null) {
                return false;
            }
        }
        return isSafeMetadata(dto.metadata());
    }

    /** Only booleans and numbers are accepted: a string could smuggle page content. */
    private boolean isSafeMetadata(Map<String, Object> metadata) {
        if (metadata == null) {
            return true;
        }
        if (metadata.size() > MAX_METADATA_KEYS) {
            return false;
        }
        return metadata.values().stream()
                .allMatch(value -> value == null || value instanceof Boolean || value instanceof Number);
    }

    private String toJson(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return "{}";
        }
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Event metadata is not serialisable");
        }
    }

    private Instant sanitizeLastSeen(Attempt attempt, Instant provided, Instant now) {
        if (provided == null || provided.isAfter(now) || provided.isBefore(attempt.getStartedAt())) {
            return now;
        }
        return provided;
    }

    private Instant latest(Instant current, Instant candidate) {
        if (current == null) {
            return candidate;
        }
        return candidate.isAfter(current) ? candidate : current;
    }
}
