"""Evidence items for authorship findings.

Every item is a stylometric observation, never a conclusion. The wording deliberately avoids
"used AI" and says what the feature measured.
"""

from __future__ import annotations

import math

from ..authorship.classifier import SIGNAL_DETAILS, AuthorshipResult
from ..schemas import Evidence

MAX_EVIDENCE_ITEMS = 3
MIN_EVIDENCE_CONTRIBUTION = 3.0


def authorship_evidence(result: AuthorshipResult, features: dict[str, float]) -> list[Evidence]:
    ranked = sorted(
        result.contributions.items(), key=lambda item: item[1], reverse=True
    )
    evidence: list[Evidence] = []
    for signal, contribution in ranked:
        if contribution < MIN_EVIDENCE_CONTRIBUTION:
            continue
        detail = f"{SIGNAL_DETAILS.get(signal, signal).capitalize()}."
        if signal == "sentenceRhythm":
            mean = features.get("sentenceLengthMean", 0.0)
            variance = features.get("sentenceLengthVariance", 0.0)
            cv = math.sqrt(variance) / mean if mean > 0 else 0.0
            detail += f" Sentence-length coefficient of variation is {cv:.3f}."
        elif signal == "contractionAvoidance":
            detail += f" Contraction rate is {features.get('contractionRate', 0.0):.3f}."
        elif signal == "formulaicRepetition":
            detail += f" Repeated-bigram rate is {features.get('repeatedBigramRate', 0.0):.3f}."
        evidence.append(
            Evidence(
                source="AUTHORSHIP",
                weight=contribution,
                detail=detail,
                metadata={
                    "signal": signal,
                    "signalValue": round(result.signals.get(signal, 0.0), 4),
                },
            )
        )
        if len(evidence) >= MAX_EVIDENCE_ITEMS:
            break

    if not evidence:
        evidence.append(
            Evidence(
                source="AUTHORSHIP",
                weight=round(sum(result.contributions.values()), 2),
                detail="No single stylometric signal stood out; priority stays in the low band.",
                metadata={"signals": {k: round(v, 4) for k, v in result.signals.items()}},
            )
        )
    return evidence


def authorship_summary(result: AuthorshipResult, features: dict[str, float]) -> str:
    ranked = sorted(result.signals.items(), key=lambda item: item[1], reverse=True)
    top = [SIGNAL_DETAILS.get(name, name) for name, value in ranked[:2] if value >= 0.5]
    reasons = "; ".join(top) if top else "no strong stylometric signal"
    drafting = (
        f" {int(features.get('revisionCount', 0))} revision(s) supplied."
        if features.get("revisionCount", 0) > 0
        else " No revision history supplied."
    )
    return (
        f"Stylometric review flag: {reasons}.{drafting} "
        f"Capped priority {result.score:.1f}/100, band {result.band}. "
        "Review aid only; not proof that AI was used and not evidence of copying."
    )
