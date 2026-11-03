"""Evidence items for candidate-pair findings."""

from __future__ import annotations

from ..config import settings
from ..features.fusion import FusionResult
from ..features.timing import TimingPair
from ..schemas import Evidence


def pair_evidence(
    fusion: FusionResult,
    lexical_details: list[dict],
    semantic_details: list[dict],
    pattern,
    timing: TimingPair,
    coverage_warning: bool,
    substantive: int,
) -> list[Evidence]:
    evidence: list[Evidence] = []

    if fusion.contributions.get("lexical", 0) > 0.5:
        top = max(lexical_details, key=lambda d: d["normalizedExcess"], default=None)
        if top:
            evidence.append(
                Evidence(
                    source="SIMILARITY",
                    weight=fusion.contributions["lexical"],
                    questionId=top["questionId"],
                    detail=(
                        f"Lexical overlap is above this question's cohort baseline "
                        f"(cosine {top['rawCosine']:.2f} vs mean {top['cohortMean']:.2f}; "
                        f"normalized excess {top['normalizedExcess']:.2f})."
                    ),
                    metadata={"perQuestion": lexical_details},
                )
            )

    if fusion.contributions.get("semantic", 0) > 0.5 and semantic_details:
        top = max(semantic_details, key=lambda d: d["normalizedExcess"])
        evidence.append(
            Evidence(
                source="SIMILARITY",
                weight=fusion.contributions["semantic"],
                questionId=top["questionId"],
                detail=(
                    f"Embedding similarity is above the cohort baseline "
                    f"(cosine {top['rawCosine']:.2f} vs mean {top['cohortMean']:.2f})."
                ),
                metadata={"perQuestion": semantic_details, "model": settings.semantic_model},
            )
        )

    if pattern and fusion.contributions.get("rare", 0) > 0.5:
        examples = pattern.shared_shingles[:4] or pattern.shared_tokens[:6]
        evidence.append(
            Evidence(
                source="PATTERN",
                weight=fusion.contributions["rare"],
                detail=(
                    "Distinctive wording appears in both answers: "
                    + "; ".join(examples[:4])
                    + "."
                ),
                metadata={
                    "sharedShingles": pattern.shared_shingles,
                    "sharedTokens": pattern.shared_tokens,
                    "spellingVariants": pattern.spelling_variants,
                    "perQuestion": pattern.per_question,
                },
            )
        )

    if pattern and fusion.contributions.get("cross", 0) > 0.5 and pattern.cross_shingles:
        evidence.append(
            Evidence(
                source="PATTERN",
                weight=fusion.contributions["cross"],
                detail=(
                    "The same rare wording appears under different questions, which is harder to "
                    "explain by question wording: " + "; ".join(pattern.cross_shingles[:3]) + "."
                ),
                metadata={"crossQuestionShingles": pattern.cross_shingles},
            )
        )

    if timing.score > 0 and fusion.contributions.get("timing", 0) > 0.5:
        examples = "; ".join(
            f"Q{aligned.questionId} revision {aligned.revisionA}/{aligned.revisionB} "
            f"within {aligned.deltaSeconds:.0f}s"
            for aligned in timing.aligned[:4]
        )
        evidence.append(
            Evidence(
                source="TIMING",
                weight=fusion.contributions["timing"],
                questionId=timing.aligned[0].questionId if timing.aligned else None,
                detail=(
                    f"{len(timing.aligned)} content-changing revisions align within the timing "
                    f"window ({examples}). Direction alone is not proof of copying."
                ),
                metadata={
                    "alignedCount": len(timing.aligned),
                    "finalGapSeconds": timing.finalGapSeconds,
                    "examples": [
                        {
                            "questionId": a.questionId,
                            "leader": a.leader,
                            "follower": a.follower,
                            "deltaSeconds": round(a.deltaSeconds, 1),
                            "similarity": a.similarity,
                        }
                        for a in timing.aligned
                    ],
                },
            )
        )

    if coverage_warning:
        evidence.append(
            Evidence(
                source="COVERAGE",
                weight=0.0,
                detail=(
                    "Fewer than two questions have substantive answers from both candidates; "
                    "the priority is capped because the comparison is incomplete."
                ),
                metadata={"substantiveQuestions": substantive},
            )
        )

    evidence.sort(key=lambda e: e.weight, reverse=True)
    return evidence


def pair_summary(
    substantive: int,
    lexical_details: list[dict],
    pattern,
    timing: TimingPair,
    coverage_warning: bool,
) -> str:
    parts: list[str] = []
    if lexical_details:
        top = max(lexical_details, key=lambda d: d["normalizedExcess"])
        parts.append(
            f"Strongest lexical overlap is on question {top['questionId']} "
            f"(normalized excess {top['normalizedExcess']:.2f})"
        )
    if pattern and (pattern.shared_shingles or pattern.shared_tokens):
        parts.append("both answers contain distinctive shared wording")
    if timing.aligned:
        parts.append(f"{len(timing.aligned)} answer changes align in time")
    if coverage_warning:
        parts.append("comparison is incomplete and the priority is capped")
    if not parts:
        parts.append("Some similarity was observed; inspect the evidence")
    return "; ".join(parts) + ". Review priority only, not a finding of misconduct."
