package com.examguard.repo;

import com.examguard.domain.ExamPermission;
import com.examguard.domain.PermissionLevel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExamPermissionRepository extends JpaRepository<ExamPermission, Long> {

    boolean existsByExamIdAndUserId(Long examId, Long userId);

    Optional<ExamPermission> findByExamIdAndUserId(Long examId, Long userId);

    List<ExamPermission> findByExamIdOrderByUserDisplayNameAsc(Long examId);

    boolean existsByExamIdAndUserIdAndLevel(Long examId, Long userId, PermissionLevel level);

    long countByExamIdAndLevel(Long examId, PermissionLevel level);
}
