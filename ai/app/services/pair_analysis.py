"""Candidate-pair analysis.

A pair request cannot carry activity events or rules by construction in schemas.py.
"""

from __future__ import annotations

import time

from ..config import settings
from ..features.fusion import fuse_pair, pair_weights
from ..features.pair_rows import build_pair_rows
from ..schemas import AnalysisResponse, Finding, PairAnalysisRequest
from .pair_evidence import pair_evidence, pair_summary


def analyze_pairs(
    request: PairAnalysisRequest,
    *,
    feature_mode: str = "full",
) -> AnalysisResponse:
    """feature_mode is for evaluation ablations: content | content_patterns | full."""
    started = time.perf_counter()
    row_set = build_pair_rows(request, feature_mode=feature_mode)
    n = len(request.candidates)
    findings: list[Finding] = []

    for row in row_set.rows:
        fusion = fuse_pair(
            row.features,
            semantic_available=row.semantic_available,
            completeness_warning=row.coverage_warning,
            coverage_warning=row.coverage_warning,
        )

        if fusion.score < settings.min_pair_priority:
            continue

        findings.append(
            Finding(
                type="CANDIDATE_PAIR",
                candidateA=row.candidate_a,
                candidateB=row.candidate_b,
                questionId=row.top_question,
                priorityScore=fusion.score,
                priorityBand=fusion.band,
                summary=pair_summary(
                    row.substantive,
                    row.lexical_details,
                    row.pattern,
                    row.timing,
                    row.coverage_warning,
                ),
                coverageWarning=row.coverage_warning,
                evidence=pair_evidence(
                    fusion,
                    row.lexical_details,
                    row.semantic_details,
                    row.pattern,
                    row.timing,
                    row.coverage_warning,
                    row.substantive,
                ),
            )
        )

    findings.sort(key=lambda f: f.priorityScore, reverse=True)
    findings = findings[: request.config.maxFindings]

    elapsed = round((time.perf_counter() - started) * 1000, 2)
    return AnalysisResponse(
        modelVersion=request.modelVersion,
        findings=findings,
        stats={
            "kind": "pairs",
            "featureMode": feature_mode,
            "candidates": n,
            "pairsEvaluated": n * (n - 1) // 2,
            "findings": len(findings),
            "lexicalBackend": row_set.lexical_backend,
            "semanticAvailable": row_set.semantic_available,
            "fusionMode": "learned" if settings.use_learned_fusion else "rules",
            "weights": pair_weights(row_set.semantic_available),
            "threshold": settings.min_pair_priority,
            "elapsedMs": elapsed,
        },
    )
