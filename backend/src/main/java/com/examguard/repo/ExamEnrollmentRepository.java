package com.examguard.repo;

import com.examguard.domain.ExamEnrollment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExamEnrollmentRepository extends JpaRepository<ExamEnrollment, Long> {

    List<ExamEnrollment> findByExamIdOrderByEmailAsc(Long examId);

    boolean existsByExamIdAndEmailIgnoreCase(Long examId, String email);

    List<ExamEnrollment> findByEmailIgnoreCase(String email);

    Optional<ExamEnrollment> findByIdAndExamId(Long id, Long examId);

    long countByExamId(Long examId);
}
