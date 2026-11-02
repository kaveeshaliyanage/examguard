package com.examguard.repo;

import com.examguard.domain.ReviewDecision;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReviewDecisionRepository extends JpaRepository<ReviewDecision, Long> {
    List<ReviewDecision> findByFindingIdOrderByCreatedAtAsc(Long findingId);

    long countByFindingId(Long findingId);
}
