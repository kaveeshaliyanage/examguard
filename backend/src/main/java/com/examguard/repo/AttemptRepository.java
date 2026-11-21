package com.examguard.repo;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
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

    List<Attempt> findByStudentUserIdOrderByStartedAtDesc(Long studentUserId);

    List<Attempt> findByExamIdAndGradedAtIsNotNull(Long examId);

    @Query("select a from Attempt a join fetch a.exam where a.status = :status and a.activeStartedAt is not null")
    List<Attempt> findRunningWithExam(@Param("status") AttemptStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Attempt a where a.id = :id")
    Optional<Attempt> findByIdForUpdate(@Param("id") Long id);

    /**
     * Targeted column update: autosave must not write the whole row, otherwise a stale entity
     * would roll back a concurrent strike increment.
     */
    @Modifying(flushAutomatically = true)
    @Query("update Attempt a set a.lastSeenAt = :seenAt where a.id = :id")
    int touchLastSeen(@Param("id") Long id, @Param("seenAt") Instant seenAt);

    @Modifying(flushAutomatically = true)
    @Query("update Attempt a set a.strikeCount = a.strikeCount + 1 where a.id = :id")
    int incrementStrikeCount(@Param("id") Long id);

    long countByExamId(Long examId);

    long countByExamIdAndStatus(Long examId, AttemptStatus status);

    long countByExamIdAndReleasedAtIsNotNull(Long examId);

    long countByExamIdAndStatusAndReleasedAtIsNull(Long examId, AttemptStatus status);
}
