package com.examguard.service;

import com.examguard.domain.AuditLog;
import com.examguard.domain.User;
import com.examguard.repo.AuditLogRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    public AuditService(AuditLogRepository auditLogRepository, ObjectMapper objectMapper) {
        this.auditLogRepository = auditLogRepository;
        this.objectMapper = objectMapper;
    }

    public void record(User actor, Long examId, String action,
                       String entityType, Long entityId, Map<String, Object> detail) {
        AuditLog log = new AuditLog();
        log.setActor(actor);
        log.setExamId(examId);
        log.setAction(action);
        log.setEntityType(entityType);
        log.setEntityId(entityId);
        if (detail != null && !detail.isEmpty()) {
            try {
                log.setDetailJson(objectMapper.writeValueAsString(detail));
            } catch (JsonProcessingException ignored) {
                log.setDetailJson(null);
            }
        }
        auditLogRepository.save(log);
    }
}
