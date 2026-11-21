"""AI-authorship analysis entry point.

Stylometry describes one answer at a time. It does not compare candidates, so an authorship
request cannot produce pair evidence, and the review-priority score is capped below the HIGH
band by construction. Copying remains the pair-similarity model's job.
"""

from __future__ import annotations

import time

from ..authorship.classifier import AUTHORSHIP_SCORE_CAP, score_features
from ..authorship.features import extract_features
from ..config import settings
from ..features.text import normalize
from ..schemas import (
    AuthorshipFinding,
    AuthorshipRequest,
    AuthorshipResponse,
    AuthorshipRevision,
)
from .authorship_evidence import authorship_evidence, authorship_summary


def _effective_text(text: str, revisions: list[AuthorshipRevision]) -> str:
    normalized = normalize(text)
    if normalized:
        return normalized
    if revisions:
        latest = max(revisions, key=lambda revision: revision.revisionNo)
        return normalize(latest.text)
    return ""


def analyze_authorship(request: AuthorshipRequest) -> AuthorshipResponse:
    started = time.perf_counter()
    findings: list[AuthorshipFinding] = []
    skipped_short = 0
    evaluated = 0
    learned_used = False

    for candidate in request.candidates:
        for answer in candidate.answers:
            effective = _effective_text(answer.text, answer.revisions)
            if len(effective) < request.config.minAnswerChars:
                skipped_short += 1
                continue

            features = extract_features(answer.text, answer.revisions)
            result = score_features(features)
            learned_used = learned_used or result.learned
            evaluated += 1
            findings.append(
                AuthorshipFinding(
                    candidateCode=candidate.candidateCode,
                    questionId=answer.questionId,
                    priorityScore=result.score,
                    priorityBand=result.band,
                    probability=result.probability,
                    summary=authorship_summary(result, features),
                    features=features,
                    evidence=authorship_evidence(result, features),
                )
            )

    findings.sort(key=lambda finding: finding.priorityScore, reverse=True)
    findings = findings[: max(0, request.config.maxFindings)]

    elapsed = round((time.perf_counter() - started) * 1000, 2)
    return AuthorshipResponse(
        modelVersion=request.modelVersion,
        findings=findings,
        stats={
            "kind": "authorship",
            "candidates": len(request.candidates),
            "answersEvaluated": evaluated,
            "skippedShort": skipped_short,
            "findings": len(findings),
            "minAnswerChars": request.config.minAnswerChars,
            "scoreCap": AUTHORSHIP_SCORE_CAP,
            "bandCeiling": "MEDIUM",
            "fusionMode": "learned" if settings.use_learned_fusion else "rules",
            "learnedApplied": learned_used,
            "elapsedMs": elapsed,
        },
    )
