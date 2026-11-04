package com.examguard.repo;

import com.examguard.domain.Finding;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.FindingType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface FindingRepository extends JpaRepository<Finding, Long> {

    List<Finding> findByExamIdOrderByPriorityScoreDesc(Long examId);

    List<Finding> findByExamIdAndTypeOrderByPriorityScoreDesc(Long examId, FindingType type);

    List<Finding> findByExamIdAndStatusOrderByPriorityScoreDesc(Long examId, FindingStatus status);

    List<Finding> findByExamIdAndTypeAndStatusOrderByPriorityScoreDesc(
            Long examId, FindingType type, FindingStatus status);

    List<Finding> findByExamIdAndStatusIn(Long examId, Collection<FindingStatus> statuses);

    long countByExamId(Long examId);

    long countByExamIdAndStatus(Long examId, FindingStatus status);

    long countByAnalysisRunId(Long analysisRunId);

    List<Finding> findByAnalysisRunId(Long analysisRunId);
}
