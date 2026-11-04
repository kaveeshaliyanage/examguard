package com.examguard.analysis;

import com.examguard.domain.AnalysisRun;
import com.examguard.domain.Candidate;
import com.examguard.domain.EvidenceItem;
import com.examguard.domain.EvidenceSource;
import com.examguard.domain.Exam;
import com.examguard.domain.Finding;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.FindingType;
import com.examguard.domain.PriorityBand;
import com.examguard.dto.AnalysisDtos.EvidenceResult;
import com.examguard.dto.AnalysisDtos.FindingResult;
import com.examguard.repo.CandidateRepository;
import com.examguard.repo.EvidenceItemRepository;
import com.examguard.repo.FindingRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class AnalysisPersistence {

    private static final Logger log = LoggerFactory.getLogger(AnalysisPersistence.class);

    private final FindingRepository findingRepository;
    private final EvidenceItemRepository evidenceRepository;
    private final CandidateRepository candidateRepository;
    private final ObjectMapper objectMapper;

    public AnalysisPersistence(
            FindingRepository findingRepository,
            EvidenceItemRepository evidenceRepository,
            CandidateRepository candidateRepository,
            ObjectMapper objectMapper) {
        this.findingRepository = findingRepository;
        this.evidenceRepository = evidenceRepository;
        this.candidateRepository = candidateRepository;
        this.objectMapper = objectMapper;
    }

    public int replaceFindings(Exam exam, AnalysisRun run, List<FindingResult> results) {
        List<Finding> open = findingRepository.findByExamIdAndStatusIn(
                exam.getId(), List.of(FindingStatus.OPEN));
        open.forEach(finding -> finding.setStatus(FindingStatus.SUPERSEDED));
        findingRepository.saveAll(open);

        int created = 0;
        for (FindingResult result : results) {
            if (persistFinding(exam, run, result)) {
                created++;
            }
        }
        return created;
    }

    private boolean persistFinding(Exam exam, AnalysisRun run, FindingResult result) {
        FindingType type;
        try {
            type = FindingType.valueOf(result.type());
        } catch (IllegalArgumentException ex) {
            log.warn("Skipping finding with unknown type {}", result.type());
            return false;
        }
        Optional<Candidate> candidateA = candidateRepository.findByExamIdAndCodeIgnoreCase(
                exam.getId(), result.candidateA());
        if (candidateA.isEmpty() || !hasValidCandidateSet(type, result)) {
            log.warn("Skipping finding because its candidate set is invalid or unknown");
            return false;
        }
        Optional<Candidate> candidateB = type == FindingType.CANDIDATE_PAIR
                ? candidateRepository.findByExamIdAndCodeIgnoreCase(exam.getId(), result.candidateB())
                : Optional.empty();
        if (type == FindingType.CANDIDATE_PAIR && candidateB.isEmpty()) {
            log.warn("Skipping pair finding with unknown candidate {}", result.candidateB());
            return false;
        }

        Finding finding = new Finding();
        finding.setExam(exam);
        finding.setAnalysisRun(run);
        finding.setType(type);
        finding.setCandidateA(candidateA.get());
        finding.setCandidateB(candidateB.orElse(null));
        finding.setQuestionId(result.questionId());
        finding.setPriorityScore(result.priorityScore());
        finding.setPriorityBand(band(result.priorityBand(), result.priorityScore()));
        finding.setCoverageWarning(result.coverageWarning());
        finding.setStatus(FindingStatus.OPEN);
        finding.setSummary(result.summary());
        findingRepository.save(finding);

        for (EvidenceResult evidence : result.evidence()) {
            evidenceRepository.save(toEvidence(finding, evidence));
        }
        return true;
    }

    private boolean hasValidCandidateSet(FindingType type, FindingResult result) {
        if (type == FindingType.CANDIDATE_PAIR) {
            return result.candidateB() != null && !result.candidateB().isBlank();
        }
        return result.candidateB() == null;
    }

    private EvidenceItem toEvidence(Finding finding, EvidenceResult result) {
        EvidenceItem item = new EvidenceItem();
        item.setFinding(finding);
        item.setSource(source(result.source()));
        item.setWeight(result.weight());
        item.setQuestionId(result.questionId());
        item.setDetail(result.detail());
        item.setMetadataJson(toJson(result));
        return item;
    }

    private EvidenceSource source(String raw) {
        try {
            return EvidenceSource.valueOf(raw);
        } catch (IllegalArgumentException | NullPointerException ex) {
            return EvidenceSource.PATTERN;
        }
    }

    private PriorityBand band(String raw, double score) {
        try {
            return PriorityBand.valueOf(raw);
        } catch (IllegalArgumentException | NullPointerException ex) {
            return PriorityBand.fromScore(score);
        }
    }

    private String toJson(EvidenceResult result) {
        try {
            return objectMapper.writeValueAsString(result.metadata());
        } catch (JsonProcessingException ex) {
            return "{}";
        }
    }
}
