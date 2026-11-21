package com.examguard.analysis;

import com.examguard.domain.PriorityBand;
import com.examguard.dto.AnalysisDtos.AuthorshipFindingResult;
import com.examguard.dto.AnalysisDtos.EvidenceResult;
import com.examguard.dto.AnalysisDtos.FindingResult;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Authorship stylometry is a review aid. Its priority score is capped below the HIGH band so a
 * machine-generated-prose signal can never, on its own, promote a candidate to HIGH or CRITICAL.
 */
public final class AuthorshipPolicy {

    public static final double SCORE_CAP = 54.0;

    private AuthorshipPolicy() {
    }

    public static double cap(double score) {
        if (Double.isNaN(score)) {
            return 0.0;
        }
        return Math.max(0.0, Math.min(SCORE_CAP, score));
    }

    public static PriorityBand band(double score) {
        return PriorityBand.fromScore(cap(score));
    }

    public static FindingResult toFinding(AuthorshipFindingResult result) {
        double score = cap(result.priorityScore());
        List<EvidenceResult> evidence = new ArrayList<>();
        if (result.evidence() != null) {
            evidence.addAll(result.evidence());
        }
        evidence.add(new EvidenceResult(
                "AUTHORSHIP",
                round(result.probability() * 100.0),
                result.questionId(),
                String.format(Locale.ROOT,
                        "Calibrated stylometric probability %.2f. Review aid only; not proof that AI "
                                + "was used and not evidence of copying.",
                        result.probability()),
                metadata(result)));
        return new FindingResult(
                "CANDIDATE_AUTHORSHIP",
                result.candidateCode(),
                null,
                result.questionId(),
                score,
                band(score).name(),
                summary(result, score),
                false,
                evidence);
    }

    private static Map<String, Object> metadata(AuthorshipFindingResult result) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("probability", round(result.probability()));
        metadata.put("scoreCap", SCORE_CAP);
        if (result.features() != null) {
            result.features().forEach((key, value) -> metadata.putIfAbsent(key, value));
        }
        return metadata;
    }

    private static String summary(AuthorshipFindingResult result, double cappedScore) {
        String base = result.summary() == null || result.summary().isBlank()
                ? "Stylometric review flag."
                : result.summary().trim();
        String capNote = String.format(Locale.ROOT,
                " Capped priority %.1f/100 (band %s).", cappedScore, band(cappedScore));
        return base.contains("Capped priority") ? base : base + capNote;
    }

    private static double round(double value) {
        return BigDecimal.valueOf(value).setScale(4, RoundingMode.HALF_UP).doubleValue();
    }
}
