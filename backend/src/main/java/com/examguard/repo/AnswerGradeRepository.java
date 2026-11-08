package com.examguard.repo;

import com.examguard.domain.AnswerGrade;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AnswerGradeRepository extends JpaRepository<AnswerGrade, Long> {

    Optional<AnswerGrade> findByAttemptIdAndQuestionId(Long attemptId, Long questionId);

    List<AnswerGrade> findByAttemptId(Long attemptId);

    List<AnswerGrade> findByAttemptIdIn(List<Long> attemptIds);
}
