package com.examguard.analysis;

import com.examguard.analysis.FindingViewDtos.DecisionView;
import com.examguard.analysis.FindingViewDtos.EvidenceView;
import com.examguard.analysis.FindingViewDtos.FindingDetail;
import com.examguard.analysis.FindingViewDtos.FindingOverviewRow;
import com.examguard.analysis.FindingViewDtos.FindingSummary;
import com.examguard.domain.EvidenceItem;
import com.examguard.domain.Exam;
import com.examguard.domain.Finding;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.FindingType;
import com.examguard.domain.PriorityBand;
import com.examguard.domain.ReviewDecision;
import com.examguard.dto.CommonDtos.ExamRef;
import com.examguard.repo.EvidenceItemRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.repo.FindingRepository;
import com.examguard.repo.ReviewDecisionRepository;
import com.examguard.service.AccessService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class FindingQueryService {

    private final FindingRepository findingRepository;
    private final EvidenceItemRepository evidenceRepository;
    private final ReviewDecisionRepository decisionRepository;
    private final ExamRepository examRepository;
    private final FindingContextBuilder contextBuilder;
    private final AccessService accessService;
    private final ObjectMapper objectMapper;

    public FindingQueryService(
            FindingRepository findingRepository,
            EvidenceItemRepository evidenceRepository,
            ReviewDecisionRepository decisionRepository,
            ExamRepository examRepository,
            FindingContextBuilder contextBuilder,
            AccessService accessService,
            ObjectMapper objectMapper) {
        this.findingRepository = findingRepository;
        this.evidenceRepository = evidenceRepository;
        this.decisionRepository = decisionRepository;
        this.examRepository = examRepository;
        this.contextBuilder = contextBuilder;
        this.accessService = accessService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<FindingSummary> list(Authentication auth, Long examId,
                                     FindingType type, FindingStatus status) {
        accessService.requireExamView(auth, examId);
        return findings(examId, type, status).stream().map(this::summary).toList();
    }

    /** Cross-exam review queue. Lecturers only see findings of exams they can view. */
    @Transactional(readOnly = true)
    public List<FindingOverviewRow> overview(Authentication auth, Long examId, FindingType type,
                                             FindingStatus status, PriorityBand band, int limit) {
        accessService.requireStaff(auth);
        String role = accessService.role(auth);
        Set<Long> visible = "ADMIN".equals(role) || "REVIEWER".equals(role)
                ? null
                : examRepository.findAllForUser(accessService.actorId(auth)).stream()
                        .map(Exam::getId)
                        .collect(Collectors.toSet());
        if (examId != null) {
            accessService.requireExamView(auth, examId);
        }
        List<Finding> candidates = examId == null
                ? findingRepository.findTop500ByOrderByPriorityScoreDesc()
                : findingRepository.findByExamIdOrderByPriorityScoreDesc(examId);
        int cap = Math.max(1, Math.min(200, limit));
        return candidates.stream()
                .filter(finding -> examId != null || visible == null
                        || visible.contains(finding.getExam().getId()))
                .filter(finding -> type == null || finding.getType() == type)
                .filter(finding -> status == null || finding.getStatus() == status)
                .filter(finding -> band == null || finding.getPriorityBand() == band)
                .limit(cap)
                .map(this::overviewRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public FindingDetail detail(Authentication auth, Long findingId) {
        Finding finding = findFinding(findingId);
        accessService.requireExamView(auth, finding.getExam().getId());
        boolean isPair = finding.getType() == FindingType.CANDIDATE_PAIR;
        boolean isAuthorship = finding.getType() == FindingType.CANDIDATE_AUTHORSHIP;
        return new FindingDetail(
                finding.getId(),
                finding.getType(),
                finding.getPriorityScore(),
                finding.getPriorityBand(),
                finding.getStatus(),
                finding.getCandidateA().getCode(),
                finding.getCandidateB() == null ? null : finding.getCandidateB().getCode(),
                finding.getSummary(),
                finding.isCoverageWarning(),
                finding.getCreatedAt(),
                new ExamRef(finding.getExam().getId(), finding.getExam().getCode(), finding.getExam().getTitle()),
                evidence(findingId),
                decisions(findingId),
                isPair
                        ? contextBuilder.pairContext(finding.getExam(),
                                finding.getCandidateA(), finding.getCandidateB())
                        : isAuthorship
                                ? contextBuilder.pairContext(finding.getExam(), finding.getCandidateA(), null)
                                : null,
                isPair || isAuthorship
                        ? null
                        : contextBuilder.incidentContext(finding.getExam(), finding.getCandidateA()));
    }

    public Finding findFinding(Long findingId) {
        return findingRepository.findById(findingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found"));
    }

    private List<Finding> findings(Long examId, FindingType type, FindingStatus status) {
        if (type != null && status != null) {
            return findingRepository.findByExamIdAndTypeAndStatusOrderByPriorityScoreDesc(examId, type, status);
        }
        if (type != null) {
            return findingRepository.findByExamIdAndTypeOrderByPriorityScoreDesc(examId, type);
        }
        if (status != null) {
            return findingRepository.findByExamIdAndStatusOrderByPriorityScoreDesc(examId, status);
        }
        return findingRepository.findByExamIdOrderByPriorityScoreDesc(examId);
    }

    private FindingSummary summary(Finding finding) {
        return new FindingSummary(
                finding.getId(),
                finding.getType(),
                finding.getPriorityScore(),
                finding.getPriorityBand(),
                finding.getStatus(),
                finding.getCandidateA().getCode(),
                finding.getCandidateB() == null ? null : finding.getCandidateB().getCode(),
                finding.getSummary(),
                finding.isCoverageWarning(),
                evidenceRepository.countByFindingId(finding.getId()),
                finding.getCreatedAt());
    }

    private FindingOverviewRow overviewRow(Finding finding) {
        return new FindingOverviewRow(
                finding.getId(),
                finding.getType(),
                finding.getPriorityScore(),
                finding.getPriorityBand(),
                finding.getStatus(),
                finding.getCandidateA().getCode(),
                finding.getCandidateB() == null ? null : finding.getCandidateB().getCode(),
                finding.getSummary(),
                finding.isCoverageWarning(),
                evidenceRepository.countByFindingId(finding.getId()),
                finding.getCreatedAt(),
                new ExamRef(finding.getExam().getId(), finding.getExam().getCode(),
                        finding.getExam().getTitle()));
    }

    private List<EvidenceView> evidence(Long findingId) {
        return evidenceRepository.findByFindingIdOrderByWeightDesc(findingId).stream()
                .map(this::evidenceView)
                .toList();
    }

    private EvidenceView evidenceView(EvidenceItem item) {
        return new EvidenceView(
                item.getId(),
                item.getSource(),
                item.getWeight(),
                item.getQuestionId(),
                item.getDetail(),
                metadata(item.getMetadataJson()),
                item.getCreatedAt());
    }

    private Map<String, Object> metadata(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (JsonProcessingException ex) {
            return Map.of();
        }
    }

    private List<DecisionView> decisions(Long findingId) {
        return decisionRepository.findByFindingIdOrderByCreatedAtAsc(findingId).stream()
                .map(this::decisionView)
                .toList();
    }

    private DecisionView decisionView(ReviewDecision decision) {
        return new DecisionView(
                decision.getId(),
                decision.getReviewer().getDisplayName(),
                decision.getOutcome(),
                decision.getRationale(),
                decision.getCreatedAt());
    }
}
