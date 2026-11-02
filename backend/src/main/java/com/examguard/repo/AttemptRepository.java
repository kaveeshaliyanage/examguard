package com.examguard.repo;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AttemptRepository extends JpaRepository<Attempt, Long> {

    List<Attempt> findByExamIdOrderByStartedAtAsc(Long examId);

    List<Attempt> findByExamIdAndStatusOrderByStartedAtAsc(Long examId, AttemptStatus status);

    @Query("select a from Attempt a join fetch a.candidate "
            + "where a.exam.id = :examId and a.status = :status order by a.startedAt asc")
    List<Attempt> findByExamIdAndStatusWithCandidate(@Param("examId") Long examId,
                                                     @Param("status") AttemptStatus status);

    Optional<Attempt> findByExamIdAndCandidateId(Long examId, Long candidateId);

    long countByExamId(Long examId);

    long countByExamIdAndStatus(Long examId, AttemptStatus status);
}
