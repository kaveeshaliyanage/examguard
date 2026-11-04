"""Candidate-incident analysis.

An incident request carries one candidate's answers, that candidate's activity events and the exam
rules. It can never carry another candidate's answers.
"""

from __future__ import annotations

import time

from ..config import settings
from ..features.activity import compute_incident
from ..features.fusion import fuse_incident
from ..schemas import AnalysisResponse, Finding, IncidentAnalysisRequest
from .incident_evidence import incident_evidence, incident_summary


def analyze_incidents(request: IncidentAnalysisRequest) -> AnalysisResponse:
    started = time.perf_counter()
    findings: list[Finding] = []

    for candidate in request.candidates:
        features = compute_incident(
            candidate,
            request.rules,
            timing_window_seconds=request.config.timingWindowSeconds,
            min_coverage_percent=request.config.minCoveragePercent,
        )
        if features is None:
            continue

        only_unclassified = not features.prohibited and not features.correlated
        fusion = fuse_incident(
            features.featureValues,
            low_coverage=features.coverageWarning,
            only_unclassified=only_unclassified,
        )
        if fusion.score < settings.min_incident_priority:
            continue

        findings.append(
            Finding(
                type="CANDIDATE_INCIDENT",
                candidateA=candidate.candidateCode,
                candidateB=None,
                questionId=(
                    features.correlated[0].questionId if features.correlated else None
                ),
                priorityScore=fusion.score,
                priorityBand=fusion.band,
                summary=incident_summary(features, only_unclassified),
                coverageWarning=features.coverageWarning,
                evidence=incident_evidence(
                    features, fusion, request.config.minCoveragePercent
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
            "kind": "incidents",
            "candidates": len(request.candidates),
            "findings": len(findings),
            "fusionMode": "learned" if settings.use_learned_fusion else "rules",
            "threshold": settings.min_incident_priority,
            "elapsedMs": elapsed,
        },
    )
