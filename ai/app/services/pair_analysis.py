"""Candidate-pair analysis.

A pair request cannot carry activity events or rules by construction in schemas.py.
"""

from __future__ import annotations

import time
from statistics import fmean

from ..config import settings
from ..features.fusion import fuse_pair, pair_weights
from ..features.lexical import cohort_stats, pairwise_similarity
from ..features.patterns import compute_patterns
from ..features.semantic import pairwise_similarity as semantic_similarity
from ..features.text import normalize
from ..features.timing import TimingPair, TimingProfile, build_profile, compute_timing_profiles
from ..schemas import AnalysisResponse, Finding, PairAnalysisRequest, PairCandidate
from .pair_evidence import pair_evidence, pair_summary


def _answer_text(candidate: PairCandidate, question_id: int) -> str:
    answer = next((a for a in candidate.answers if a.questionId == question_id), None)
    if answer is None:
        return ""
    if answer.text and answer.text.strip():
        return answer.text
    if answer.revisions:
        return max(answer.revisions, key=lambda r: r.revisionNo).text
    return ""


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _excess(raw: float, mean: float) -> float:
    """Similarity above the cohort baseline, normalized to 0-1."""
    if mean >= 0.999:
        return 0.0
    return _clamp((raw - mean) / (1.0 - mean))


def _learned_used() -> bool:
    return settings.use_learned_fusion


def analyze_pairs(
    request: PairAnalysisRequest,
    *,
    feature_mode: str = "full",
) -> AnalysisResponse:
    """feature_mode is for evaluation ablations: content | content_patterns | full."""
    started = time.perf_counter()
    questions = request.questions
    question_ids = [q.id for q in questions]
    candidates = request.candidates
    n = len(candidates)
    answer_texts: list[dict[int, str]] = [
        {question.id: _answer_text(candidate, question.id) for question in questions}
        for candidate in candidates
    ]
    normalized_lengths: list[dict[int, int]] = [
        {question_id: len(normalize(text)) for question_id, text in texts.items()}
        for texts in answer_texts
    ]

    lexical_matrices: dict[int, list[list[float]]] = {}
    lexical_backend = "empty"
    for question in questions:
        texts = [answer_texts[index][question.id] for index in range(n)]
        matrix, backend = pairwise_similarity(texts)
        lexical_matrices[question.id] = matrix
        if backend in {"tfidf", "jaccard"}:
            lexical_backend = backend

    semantic_matrices: dict[int, list[list[float]]] = {}
    semantic_available = False
    for question in questions:
        texts = [answer_texts[index][question.id] for index in range(n)]
        matrix, state = semantic_similarity(texts)
        if matrix is not None and state == "sbert":
            semantic_matrices[question.id] = matrix
            semantic_available = True

    use_patterns = feature_mode in {"content_patterns", "full"}
    use_timing = feature_mode == "full"
    timing_profiles: list[TimingProfile] = (
        [build_profile(c, question_ids, request.config.minAnswerChars) for c in candidates]
        if use_timing
        else []
    )
    similarity_cache: dict[tuple[str, str], float] | None = {} if use_timing else None
    patterns = (
        compute_patterns(candidates, question_ids, request.config.rareDfMax)
        if use_patterns and n > 1
        else {}
    )

    lexical_stats, semantic_stats = _cohort_baselines(
        questions, lexical_matrices, semantic_matrices, normalized_lengths, request
    )

    findings: list[Finding] = []

    for i in range(n):
        for j in range(i + 1, n):
            a, b = candidates[i], candidates[j]
            substantive = 0
            lexical_values: list[float] = []
            semantic_values: list[float] = []
            lexical_details: list[dict] = []
            semantic_details: list[dict] = []

            for question in questions:
                if normalized_lengths[i][question.id] < request.config.minAnswerChars or (
                    normalized_lengths[j][question.id] < request.config.minAnswerChars
                ):
                    continue
                substantive += 1

                matrix = lexical_matrices[question.id]
                raw = matrix[i][j]
                mean = lexical_stats.get(question.id, 0.0)
                normalized = _excess(raw, mean)
                lexical_values.append(normalized)
                lexical_details.append(
                    {
                        "questionId": question.id,
                        "rawCosine": round(raw, 4),
                        "cohortMean": round(mean, 4),
                        "normalizedExcess": round(normalized, 4),
                    }
                )

                if semantic_available:
                    sem_matrix = semantic_matrices.get(question.id)
                    if sem_matrix is not None:
                        sem_raw = sem_matrix[i][j]
                        sem_mean = semantic_stats.get(question.id, 0.0)
                        sem_norm = _excess(sem_raw, sem_mean)
                        semantic_values.append(sem_norm)
                        semantic_details.append(
                            {
                                "questionId": question.id,
                                "rawCosine": round(sem_raw, 4),
                                "cohortMean": round(sem_mean, 4),
                                "normalizedExcess": round(sem_norm, 4),
                            }
                        )

            if substantive == 0:
                continue

            lexical = fmean(lexical_values) if lexical_values else 0.0
            semantic = fmean(semantic_values) if semantic_values else 0.0
            pattern = patterns.get((a.candidateCode, b.candidateCode))
            rare = pattern.rare_score if pattern else 0.0
            cross = pattern.cross_score if pattern else 0.0

            timing = TimingPair()
            if use_timing:
                timing = compute_timing_profiles(
                    timing_profiles[i],
                    timing_profiles[j],
                    question_ids,
                    window_seconds=request.config.timingWindowSeconds,
                    similarity_cache=similarity_cache,
                )

            coverage_warning = substantive < 2
            fusion = fuse_pair(
                {
                    "lexical": lexical,
                    "semantic": semantic if semantic_available else 0.0,
                    "rare": rare,
                    "cross": cross,
                    "timing": timing.score,
                },
                semantic_available=semantic_available,
                completeness_warning=coverage_warning,
                coverage_warning=coverage_warning,
            )

            if fusion.score < settings.min_pair_priority:
                continue

            top_question = None
            if lexical_details:
                top_question = max(
                    lexical_details, key=lambda d: d["normalizedExcess"]
                )["questionId"]

            findings.append(
                Finding(
                    type="CANDIDATE_PAIR",
                    candidateA=a.candidateCode,
                    candidateB=b.candidateCode,
                    questionId=top_question,
                    priorityScore=fusion.score,
                    priorityBand=fusion.band,
                    summary=pair_summary(
                        substantive, lexical_details, pattern, timing, coverage_warning
                    ),
                    coverageWarning=coverage_warning,
                    evidence=pair_evidence(
                        fusion,
                        lexical_details,
                        semantic_details,
                        pattern,
                        timing,
                        coverage_warning,
                        substantive,
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
            "lexicalBackend": lexical_backend,
            "semanticAvailable": semantic_available,
            "fusionMode": "learned" if _learned_used() else "rules",
            "weights": pair_weights(semantic_available),
            "threshold": settings.min_pair_priority,
            "elapsedMs": elapsed,
        },
    )


def _cohort_baselines(
    questions,
    lexical_matrices,
    semantic_matrices,
    normalized_lengths: list[dict[int, int]],
    request,
) -> tuple[dict[int, float], dict[int, float]]:
    n = len(normalized_lengths)
    lexical_stats: dict[int, float] = {}
    semantic_stats: dict[int, float] = {}

    def eligible(x: int, y: int, question_id: int) -> bool:
        return (
            normalized_lengths[x][question_id] >= request.config.minAnswerChars
            and normalized_lengths[y][question_id] >= request.config.minAnswerChars
        )

    for question in questions:
        matrix = lexical_matrices[question.id]
        values = [
            matrix[x][y]
            for x in range(n)
            for y in range(x + 1, n)
            if eligible(x, y, question.id)
        ]
        lexical_stats[question.id] = cohort_stats(values)[0]
        sem_matrix = semantic_matrices.get(question.id)
        if sem_matrix is not None:
            sem_values = [
                sem_matrix[x][y]
                for x in range(n)
                for y in range(x + 1, n)
                if eligible(x, y, question.id)
            ]
            semantic_stats[question.id] = cohort_stats(sem_values)[0]
    return lexical_stats, semantic_stats
