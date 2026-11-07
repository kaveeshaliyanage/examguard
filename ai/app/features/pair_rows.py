"""Pair feature construction shared by inference and training export.

Keeping one builder guarantees that a training row and the vector scored at request time
are produced by identical code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import fmean
from typing import Any

from ..schemas import PairAnalysisRequest, PairCandidate
from .lexical import cohort_stats, pairwise_similarity
from .patterns import compute_patterns
from .semantic import pairwise_similarity as semantic_similarity
from .text import normalize
from .timing import TimingPair, TimingProfile, build_profile, compute_timing_profiles


@dataclass
class PairFeatureRow:
    candidate_a: str
    candidate_b: str
    features: dict[str, float]
    substantive: int
    coverage_warning: bool
    semantic_available: bool
    lexical_details: list[dict] = field(default_factory=list)
    semantic_details: list[dict] = field(default_factory=list)
    pattern: Any | None = None
    timing: TimingPair = field(default_factory=TimingPair)
    top_question: int | None = None


@dataclass
class PairRowSet:
    rows: list[PairFeatureRow]
    lexical_backend: str
    semantic_available: bool


def answer_text(candidate: PairCandidate, question_id: int) -> str:
    answer = next((a for a in candidate.answers if a.questionId == question_id), None)
    if answer is None:
        return ""
    if answer.text and answer.text.strip():
        return answer.text
    if answer.revisions:
        return max(answer.revisions, key=lambda r: r.revisionNo).text
    return ""


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def excess(raw: float, mean: float) -> float:
    """Similarity above the cohort baseline, normalized to 0-1."""
    if mean >= 0.999:
        return 0.0
    return clamp((raw - mean) / (1.0 - mean))


def cohort_baselines(
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


def build_pair_rows(
    request: PairAnalysisRequest,
    *,
    feature_mode: str = "full",
) -> PairRowSet:
    """feature_mode is for evaluation ablations: content | content_patterns | full."""
    questions = request.questions
    question_ids = [q.id for q in questions]
    candidates = request.candidates
    n = len(candidates)
    answer_texts: list[dict[int, str]] = [
        {question.id: answer_text(candidate, question.id) for question in questions}
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

    lexical_stats, semantic_stats = cohort_baselines(
        questions, lexical_matrices, semantic_matrices, normalized_lengths, request
    )

    rows: list[PairFeatureRow] = []

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
                normalized = excess(raw, mean)
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
                        sem_norm = excess(sem_raw, sem_mean)
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

            # A one-question exam is fully covered by one substantive answer.
            coverage_warning = substantive < min(2, len(questions))
            top_question = None
            if lexical_details:
                top_question = max(
                    lexical_details, key=lambda d: d["normalizedExcess"]
                )["questionId"]

            rows.append(
                PairFeatureRow(
                    candidate_a=a.candidateCode,
                    candidate_b=b.candidateCode,
                    features={
                        "lexical": lexical,
                        "semantic": semantic if semantic_available else 0.0,
                        "rare": rare,
                        "cross": cross,
                        "timing": timing.score,
                        "coverageWarning": 1.0 if coverage_warning else 0.0,
                    },
                    substantive=substantive,
                    coverage_warning=coverage_warning,
                    semantic_available=semantic_available,
                    lexical_details=lexical_details,
                    semantic_details=semantic_details,
                    pattern=pattern,
                    timing=timing,
                    top_question=top_question,
                )
            )

    return PairRowSet(
        rows=rows,
        lexical_backend=lexical_backend,
        semantic_available=semantic_available,
    )
