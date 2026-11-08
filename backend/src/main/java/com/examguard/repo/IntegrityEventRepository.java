package com.examguard.repo;

import com.examguard.domain.IntegrityEvent;
import com.examguard.domain.IntegritySignal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface IntegrityEventRepository extends JpaRepository<IntegrityEvent, Long> {

    List<IntegrityEvent> findByAttemptIdOrderByOccurredAtAsc(Long attemptId);

    boolean existsByAttemptIdAndEpisodeKey(Long attemptId, String episodeKey);

    long countByAttemptId(Long attemptId);

    List<IntegrityEvent> findByAttempt_Exam_IdInAndSignalAndOccurredAtAfterOrderByOccurredAtAsc(
            Collection<Long> examIds, IntegritySignal signal, Instant after);
}
