package com.examguard.repo;

import com.examguard.domain.Question;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    List<Question> findByExamIdOrderByOrderIndexAsc(Long examId);

    Optional<Question> findByIdAndExamId(Long id, Long examId);

    long countByExamId(Long examId);
}
