package com.examguard.repo;

import com.examguard.domain.AnswerRevision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AnswerRevisionRepository extends JpaRepository<AnswerRevision, Long> {

    List<AnswerRevision> findByAttemptIdAndQuestionIdOrderByRevisionNoDesc(Long attemptId, Long questionId);

    Optional<AnswerRevision> findFirstByAttemptIdAndQuestionIdOrderByRevisionNoDesc(Long attemptId, Long questionId);

    List<AnswerRevision> findByAttemptIdOrderByQuestionIdAscRevisionNoAsc(Long attemptId);

    List<AnswerRevision> findByAttemptIdInOrderByAttemptIdAscQuestionIdAscRevisionNoAsc(List<Long> attemptIds);

    long countByAttemptId(Long attemptId);

    long countByAttemptIdAndQuestionId(Long attemptId, Long questionId);

    @Query("select count(distinct r.question.id) from AnswerRevision r where r.attempt.id = :attemptId")
    long countAnsweredQuestions(@Param("attemptId") Long attemptId);
}
