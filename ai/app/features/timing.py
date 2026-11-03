"""Timing relationships between two candidates' answer revisions.

Only content-changing revisions are used. Two candidates saving at similar times is weak evidence
on its own; a near-simultaneous insertion of similar text is the signal.

Profiles are built once per candidate so pair analysis does not re-normalise every answer for
every pair, and cheap exact upper bounds skip sequence comparisons that cannot reach the
similarity threshold.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from difflib import SequenceMatcher

from ..schemas import PairCandidate
from .text import normalize

MIN_ALIGNMENT_SIMILARITY = 0.62


@dataclass(frozen=True)
class RevisionPoint:
    questionId: int
    revisionNo: int
    savedAt: datetime
    compareText: str
    length: int
    charCounts: Counter


@dataclass(frozen=True)
class TimingProfile:
    """Revisions eligible for comparison, plus the candidate's last non-empty save."""

    candidateCode: str
    revisions: dict[int, tuple[RevisionPoint, ...]]
    latestSavedAt: datetime | None


@dataclass
class AlignedChange:
    questionId: int
    leader: str
    follower: str
    deltaSeconds: float
    similarity: float
    revisionA: int
    revisionB: int


@dataclass
class TimingPair:
    score: float = 0.0
    aligned: list[AlignedChange] = field(default_factory=list)
    finalGapSeconds: float | None = None


def build_profile(
    candidate: PairCandidate,
    question_ids: list[int],
    min_chars: int = 20,
) -> TimingProfile:
    answers = {answer.questionId: answer for answer in candidate.answers}
    revisions: dict[int, tuple[RevisionPoint, ...]] = {}
    latest: datetime | None = None

    for question_id in question_ids:
        points: list[RevisionPoint] = []
        answer = answers.get(question_id)
        if answer is not None:
            for revision in answer.revisions:
                text = normalize(revision.text)
                if not text:
                    continue
                if latest is None or revision.savedAt > latest:
                    latest = revision.savedAt
                if len(text) < min_chars:
                    continue
                compare_text = text.lower()
                points.append(
                    RevisionPoint(
                        questionId=question_id,
                        revisionNo=revision.revisionNo,
                        savedAt=revision.savedAt,
                        compareText=compare_text,
                        length=len(text),
                        charCounts=Counter(compare_text),
                    )
                )
        points.sort(key=lambda point: point.savedAt)
        revisions[question_id] = tuple(points)

    return TimingProfile(
        candidateCode=candidate.candidateCode,
        revisions=revisions,
        latestSavedAt=latest,
    )


def _similarity_upper_bound(a: RevisionPoint, b: RevisionPoint) -> float:
    """SequenceMatcher.ratio() cannot exceed the character-multiset overlap."""
    total = a.length + b.length
    if total == 0:
        return 0.0
    common = sum((a.charCounts & b.charCounts).values())
    return 2.0 * common / total


def _similarity(a: RevisionPoint, b: RevisionPoint) -> float:
    if a.compareText == b.compareText:
        return 1.0
    if _similarity_upper_bound(a, b) < MIN_ALIGNMENT_SIMILARITY:
        return 0.0
    return SequenceMatcher(None, a.compareText, b.compareText).ratio()


def compute_timing_profiles(
    profile_a: TimingProfile,
    profile_b: TimingProfile,
    question_ids: list[int],
    window_seconds: int = 120,
) -> TimingPair:
    result = TimingPair()
    if window_seconds <= 0:
        return result

    for question_id in question_ids:
        best = None
        for ra in profile_a.revisions.get(question_id, ()):
            for rb in profile_b.revisions.get(question_id, ()):
                delta = (ra.savedAt - rb.savedAt).total_seconds()
                if abs(delta) > window_seconds:
                    continue
                similarity = _similarity(ra, rb)
                if similarity < MIN_ALIGNMENT_SIMILARITY:
                    continue
                quality = similarity * (1.0 - 0.4 * abs(delta) / window_seconds)
                if best is None or quality > best[0]:
                    best = (quality, ra, rb, delta, similarity)

        if best is not None:
            _, ra, rb, delta, similarity = best
            a_leads = delta <= 0
            result.aligned.append(
                AlignedChange(
                    questionId=question_id,
                    leader=profile_a.candidateCode if a_leads else profile_b.candidateCode,
                    follower=profile_b.candidateCode if a_leads else profile_a.candidateCode,
                    deltaSeconds=abs(delta),
                    similarity=round(similarity, 4),
                    revisionA=ra.revisionNo,
                    revisionB=rb.revisionNo,
                )
            )

    if profile_a.latestSavedAt and profile_b.latestSavedAt:
        result.finalGapSeconds = abs(
            (profile_a.latestSavedAt - profile_b.latestSavedAt).total_seconds()
        )

    if result.aligned:
        average_similarity = sum(a.similarity for a in result.aligned) / len(result.aligned)
        coverage = min(1.0, len(result.aligned) / 2.0)
        result.score = round(min(1.0, coverage * (0.7 + 0.3 * average_similarity)), 4)
    return result


def compute_timing(
    candidate_a: PairCandidate,
    candidate_b: PairCandidate,
    question_ids: list[int],
    window_seconds: int = 120,
    min_chars: int = 20,
) -> TimingPair:
    return compute_timing_profiles(
        build_profile(candidate_a, question_ids, min_chars),
        build_profile(candidate_b, question_ids, min_chars),
        question_ids,
        window_seconds,
    )
