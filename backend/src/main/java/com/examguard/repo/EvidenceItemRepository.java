package com.examguard.repo;

import com.examguard.domain.EvidenceItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EvidenceItemRepository extends JpaRepository<EvidenceItem, Long> {
    List<EvidenceItem> findByFindingIdOrderByWeightDesc(Long findingId);

    long countByFindingId(Long findingId);
}
