package com.examguard.repo;

import com.examguard.domain.AnalysisRun;
import com.examguard.domain.AnalysisStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface AnalysisRunRepository extends JpaRepository<AnalysisRun, Long> {
    List<AnalysisRun> findByExamIdOrderByStartedAtDesc(Long examId);

    List<AnalysisRun> findByExamIdAndStatusIn(Long examId, Collection<AnalysisStatus> statuses);

    List<AnalysisRun> findTop10ByOrderByStartedAtDesc();
}
