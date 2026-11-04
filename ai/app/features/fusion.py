"""Review-priority fusion. Scores are priorities, never probabilities of misconduct."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from ..config import settings

PAIR_WEIGHTS = {
    "lexical": 0.28,
    "semantic": 0.22,
    "rare": 0.28,
    "cross": 0.10,
    "timing": 0.12,
}

INCIDENT_WEIGHTS = {
    "prohibited": 0.45,
    "correlated": 0.25,
    "repeat": 0.15,
    "unclassified": 0.15,
}

PAIR_FEATURE_ORDER = ["lexical", "semantic", "rare", "cross", "timing", "coverageWarning"]
INCIDENT_FEATURE_ORDER = [
    "prohibited", "correlated", "repeat", "unclassified", "coverage", "extensionConnected"
]

PAIR_CAP_INCOMPLETE = 35.0
INCIDENT_CAP_LOW_COVERAGE = 45.0
INCIDENT_CAP_UNCLASSIFIED_ONLY = 40.0


@dataclass
class FusionResult:
    score: float
    band: str
    weights: dict[str, float]
    contributions: dict[str, float]
    capped: bool = False
    learned: bool = False


def priority_band(score: float) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 55:
        return "HIGH"
    if score >= 30:
        return "MEDIUM"
    return "LOW"


def pair_weights(semantic_available: bool) -> dict[str, float]:
    if semantic_available:
        return dict(PAIR_WEIGHTS)
    remaining = {k: v for k, v in PAIR_WEIGHTS.items() if k != "semantic"}
    total = sum(remaining.values())
    return {k: v / total for k, v in remaining.items()}


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _learned(kind: str, vector: list[float]) -> float | None:
    if not settings.use_learned_fusion:
        return None
    model = _load_model(kind)
    if model is None:
        return None
    try:
        probability = float(model.predict_proba([vector])[0][1])
        return round(_clamp(probability) * 100.0, 2)
    except Exception:
        return None


@lru_cache(maxsize=4)
def _load_model(kind: str) -> Any | None:
    path = settings.model_dir / f"{kind}_fusion.joblib"
    if not path.exists():
        return None
    try:
        import joblib

        return joblib.load(path)
    except Exception:
        return None


def fuse_pair(
    features: dict[str, float],
    *,
    semantic_available: bool,
    completeness_warning: bool,
    coverage_warning: bool,
) -> FusionResult:
    weights = pair_weights(semantic_available)
    contributions = {
        name: round(weight * _clamp(features.get(name, 0.0)) * 100.0, 2)
        for name, weight in weights.items()
    }
    score = round(sum(contributions.values()), 2)
    capped = False
    if completeness_warning or coverage_warning:
        score = min(score, PAIR_CAP_INCOMPLETE)
        capped = score >= PAIR_CAP_INCOMPLETE

    learned = _learned(
        "pair",
        [features.get(name, 0.0) for name in PAIR_FEATURE_ORDER],
    )
    if learned is not None and score > 0:
        scale = learned / score
        contributions = {k: round(v * scale, 2) for k, v in contributions.items()}
        score = learned
        capped = capped and score >= PAIR_CAP_INCOMPLETE

    return FusionResult(
        score=max(0.0, min(100.0, round(score, 2))),
        band=priority_band(score),
        weights=weights,
        contributions=contributions,
        capped=capped,
        learned=learned is not None,
    )


def fuse_incident(
    features: dict[str, float],
    *,
    low_coverage: bool,
    only_unclassified: bool,
) -> FusionResult:
    contributions = {
        name: round(weight * _clamp(features.get(name, 0.0)) * 100.0, 2)
        for name, weight in INCIDENT_WEIGHTS.items()
    }
    score = round(sum(contributions.values()), 2)
    capped = False
    if only_unclassified:
        score = min(score, INCIDENT_CAP_UNCLASSIFIED_ONLY)
        capped = True
    if low_coverage:
        score = min(score, INCIDENT_CAP_LOW_COVERAGE)
        capped = True

    learned = _learned(
        "incident",
        [features.get(name, 0.0) for name in INCIDENT_FEATURE_ORDER],
    )
    if learned is not None and score > 0:
        scale = learned / score
        contributions = {k: round(v * scale, 2) for k, v in contributions.items()}
        score = learned

    return FusionResult(
        score=max(0.0, min(100.0, round(score, 2))),
        band=priority_band(score),
        weights=dict(INCIDENT_WEIGHTS),
        contributions=contributions,
        capped=capped,
        learned=learned is not None,
    )
