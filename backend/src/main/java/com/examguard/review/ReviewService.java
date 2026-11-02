package com.examguard.review;

import com.examguard.analysis.FindingViewDtos.DecisionView;
import com.examguard.domain.AuditLog;
import com.examguard.domain.DecisionOutcome;
import com.examguard.domain.Finding;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.ReviewDecision;
import com.examguard.domain.User;
import com.examguard.repo.AuditLogRepository;
import com.examguard.repo.FindingRepository;
import com.examguard.repo.ReviewDecisionRepository;
import com.examguard.review.ReviewDtos.AuditView;
import com.examguard.review.ReviewDtos.DecisionRequest;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class ReviewService {

    private final FindingRepository findingRepository;
    private final ReviewDecisionRepository decisionRepository;
    private final AuditLogRepository auditLogRepository;
    private final AccessService accessService;
    private final AuditService auditService;

    public ReviewService(
            FindingRepository findingRepository,
            ReviewDecisionRepository decisionRepository,
            AuditLogRepository auditLogRepository,
            AccessService accessService,
            AuditService auditService) {
        this.findingRepository = findingRepository;
        this.decisionRepository = decisionRepository;
        this.auditLogRepository = auditLogRepository;
        this.accessService = accessService;
        this.auditService = auditService;
    }

    @Transactional
    public DecisionView decide(Authentication auth, Long findingId, DecisionRequest request) {
        Finding finding = findFinding(findingId);
        accessService.requireExamReview(auth, finding.getExam().getId());
        if (finding.getStatus() == FindingStatus.SUPERSEDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Superseded findings cannot be decided");
        }
        User reviewer = accessService.currentUser(auth);

        ReviewDecision decision = new ReviewDecision();
        decision.setFinding(finding);
        decision.setReviewer(reviewer);
        decision.setOutcome(request.outcome());
        decision.setRationale(request.rationale().trim());
        decision.setCreatedAt(Instant.now());
        decisionRepository.save(decision);

        finding.setStatus(statusFor(request.outcome()));
        findingRepository.save(finding);

        auditService.record(reviewer, finding.getExam().getId(), "FINDING_DECISION", "FINDING", findingId,
                Map.of("outcome", request.outcome().name(), "findingType", finding.getType().name()));

        return new DecisionView(
                decision.getId(),
                reviewer.getDisplayName(),
                decision.getOutcome(),
                decision.getRationale(),
                decision.getCreatedAt());
    }

    @Transactional(readOnly = true)
    public List<AuditView> audit(Authentication auth, Long examId) {
        accessService.requireExamView(auth, examId);
        return auditLogRepository.findByExamIdOrderByCreatedAtDesc(examId).stream()
                .map(this::auditView)
                .toList();
    }

    private AuditView auditView(AuditLog log) {
        return new AuditView(
                log.getId(),
                log.getActor() == null ? "system" : log.getActor().getDisplayName(),
                log.getAction(),
                log.getEntityType(),
                log.getEntityId(),
                log.getDetailJson(),
                log.getCreatedAt());
    }

    private FindingStatus statusFor(DecisionOutcome outcome) {
        return switch (outcome) {
            case CONFIRMED -> FindingStatus.CONFIRMED;
            case DISMISSED -> FindingStatus.DISMISSED;
            case NEEDS_INFO -> FindingStatus.NEEDS_INFO;
            case ESCALATED -> FindingStatus.ESCALATED;
        };
    }

    private Finding findFinding(Long findingId) {
        return findingRepository.findById(findingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found"));
    }
}
