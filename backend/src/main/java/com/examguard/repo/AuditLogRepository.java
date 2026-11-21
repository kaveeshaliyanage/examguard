package com.examguard.repo;

import com.examguard.domain.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findByExamIdOrderByCreatedAtDesc(Long examId);

    List<AuditLog> findTop20ByOrderByCreatedAtDesc();
}
