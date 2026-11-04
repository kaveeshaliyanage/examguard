package com.examguard.repo;

import com.examguard.domain.ActivityEvent;
import com.examguard.domain.EventType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ActivityEventRepository extends JpaRepository<ActivityEvent, Long> {

    List<ActivityEvent> findByAttemptIdOrderByOccurredAtAsc(Long attemptId);

    List<ActivityEvent> findByAttemptIdInOrderByAttemptIdAscOccurredAtAsc(List<Long> attemptIds);

    boolean existsByAttemptIdAndClientEventId(Long attemptId, String clientEventId);

    long countByAttemptId(Long attemptId);

    long countByAttemptIdAndEventType(Long attemptId, EventType eventType);

    Optional<ActivityEvent> findFirstByAttemptIdOrderByOccurredAtAsc(Long attemptId);

    Optional<ActivityEvent> findFirstByAttemptIdOrderByOccurredAtDesc(Long attemptId);
}
