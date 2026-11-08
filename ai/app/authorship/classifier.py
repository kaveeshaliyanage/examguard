"""Review-priority scoring for machine-generated prose.

The output is a **review aid**. It is never proof that a candidate used AI, and the score is
capped so it can never reach the HIGH or CRITICAL review bands on its own.

Rules baseline
--------------
Each signal is a 0-1 indicator derived deterministically from the stylometry vector. The
weighted sum is passed through a logistic link to produce a probability; the priority score is
that probability on a 0-100 scale, capped at :data:`AUTHORSHIP_SCORE_CAP`.

====================== ======= ============================================================
Signal                 Weight  Definition
====================== ======= ============================================================
sentenceRhythm          0.18   ``1 - cv / 0.5`` where cv is the coefficient of variation of
                               words per sentence; machine prose keeps sentence lengths even.
sentenceVariability     0.10   ``1 - var / (var + 10)`` on words per sentence.
contractionAvoidance    0.14   ``1 - contractionRate / 0.03``; formal machine prose rarely
                               contracts.
paragraphUniformity     0.10   ``1 - var / (var + 80)`` on words per paragraph.
functionWordRegularity  0.14   Distance of the ten function-word frequencies from the
                               documented human reference; see ``HUMAN_FUNCTION_WORD_PRIOR``.
formulaicRepetition     0.10   ``repeatedBigramRate / 0.08``; boilerplate repeats bigrams.
punctuationFlatness     0.10   ``1 - expressivePunctuationRate / 0.03`` where expressive
                               punctuation is semicolons, dashes and parentheses.
revisionFlatness        0.08   Flat drafting: little text added between revisions and a
                               final/first word ratio near one. Neutral (0.5) without revisions.
formalWordLength        0.06   ``(meanWordLength - 4.9) / 1.0``; formal machine prose leans on
                               longer words.
====================== ======= ============================================================

The logistic link uses ``RULES_CENTER = 0.68`` and ``RULES_GAIN = 6.0``: a weighted score of
0.68 maps to probability 0.5. Those constants, and the weights above, are repeated in
``models/authorship.MODEL_CARD.md``.

Learned model
-------------
When ``models/authorship.joblib`` exists and ``USE_LEARNED_FUSION=true``, its ``predict_proba``
replaces the rules probability. The cap, the band ceiling and the feature-order check still
apply, so a broken or over-confident estimator cannot push a finding into HIGH.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from ..config import settings
from .features import (
    AUTHORSHIP_FEATURE_ORDER,
    FUNCTION_WORD_FEATURES,
    FUNCTION_WORDS,
    feature_order_matches,
)

logger = logging.getLogger(__name__)

AUTHORSHIP_SCORE_CAP = 54.0
AUTHORSHIP_BAND_CEILING = "MEDIUM"
AUTHORSHIP_MEDIUM_FLOOR = 30.0

RULES_CENTER = 0.68
RULES_GAIN = 6.0

RULES_WEIGHTS = {
    "sentenceRhythm": 0.18,
    "sentenceVariability": 0.10,
    "contractionAvoidance": 0.14,
    "paragraphUniformity": 0.10,
    "functionWordRegularity": 0.14,
    "formulaicRepetition": 0.10,
    "punctuationFlatness": 0.10,
    "revisionFlatness": 0.08,
    "formalWordLength": 0.06,
}

# Human reference frequencies for the ten function words, measured on the synthetic human
# pool in app/training/authorship_cohorts.py. A machine-like answer drifts further away.
HUMAN_FUNCTION_WORD_PRIOR = {
    "the": 0.0822,
    "of": 0.0057,
    "and": 0.0209,
    "to": 0.0050,
    "in": 0.0078,
    "that": 0.0115,
    "is": 0.0191,
    "it": 0.0374,
    "for": 0.0069,
    "with": 0.0044,
}
FUNCTION_WORD_DISTANCE_SCALE = 0.025

SIGNAL_DETAILS = {
    "sentenceRhythm": "sentence lengths are unusually even",
    "sentenceVariability": "words per sentence barely vary",
    "contractionAvoidance": "contractions are absent",
    "paragraphUniformity": "paragraphs have near-identical length",
    "functionWordRegularity": "function-word mix is flatter than the human reference",
    "formulaicRepetition": "formulaic bigrams repeat",
    "punctuationFlatness": "punctuation is sparse and regular",
    "revisionFlatness": "drafting history shows little incremental change",
    "formalWordLength": "average word length sits in a formal band",
}


@dataclass
class AuthorshipResult:
    score: float
    band: str
    probability: float
    signals: dict[str, float]
    contributions: dict[str, float]
    learned: bool = False
    capped: bool = False


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def authorship_band(score: float) -> str:
    """LOW below 30, MEDIUM from 30 to the cap. HIGH and CRITICAL are unreachable."""
    return "MEDIUM" if score >= AUTHORSHIP_MEDIUM_FLOOR else "LOW"


def _sigmoid(value: float) -> float:
    if value >= 0:
        return 1.0 / (1.0 + math.exp(-value))
    exponent = math.exp(value)
    return exponent / (1.0 + exponent)


def rules_signals(features: dict[str, float]) -> dict[str, float]:
    """Map the stylometry vector to the documented 0-1 rules signals."""
    variance = max(0.0, features.get("sentenceLengthVariance", 0.0))
    sentence_mean = max(0.0, features.get("sentenceLengthMean", 0.0))
    sentence_std = math.sqrt(variance)
    coefficient_of_variation = (
        sentence_std / sentence_mean if sentence_mean > 0 else 0.0
    )
    paragraph_variance = max(0.0, features.get("paragraphLengthVariance", 0.0))
    contraction_rate = max(0.0, features.get("contractionRate", 0.0))
    bigram_rate = max(0.0, features.get("repeatedBigramRate", 0.0))
    expressive_punctuation = sum(
        max(0.0, features.get(name, 0.0))
        for name in ("semicolonRate", "dashRate", "parenthesisRate")
    )

    deviation = sum(
        abs(features.get(feature, 0.0) - HUMAN_FUNCTION_WORD_PRIOR[word])
        for feature, word in zip(FUNCTION_WORD_FEATURES, FUNCTION_WORDS)
    ) / len(FUNCTION_WORDS)

    revision_count = features.get("revisionCount", 0.0)
    if revision_count <= 0:
        revision_flatness = 0.5
    else:
        mean_added = max(0.0, features.get("meanWordsAddedPerRevision", 0.0))
        final_first = max(0.0, features.get("finalFirstWordRatio", 0.0))
        flat = _clamp(1.0 - mean_added / 60.0)
        growth = _clamp((final_first - 1.0) / 3.0)
        revision_flatness = 0.5 * flat + 0.5 * (1.0 - growth)

    average_word_length = features.get("averageWordLength", 0.0)
    return {
        "sentenceRhythm": _clamp(1.0 - coefficient_of_variation / 0.5),
        "sentenceVariability": _clamp(1.0 - variance / (variance + 10.0)),
        "contractionAvoidance": _clamp(1.0 - contraction_rate / 0.03),
        "paragraphUniformity": _clamp(1.0 - paragraph_variance / (paragraph_variance + 80.0)),
        "functionWordRegularity": _clamp(1.0 - deviation / FUNCTION_WORD_DISTANCE_SCALE),
        "formulaicRepetition": _clamp(bigram_rate / 0.08),
        "punctuationFlatness": _clamp(1.0 - expressive_punctuation / 0.03),
        "revisionFlatness": _clamp(revision_flatness),
        "formalWordLength": (
            _clamp((average_word_length - 4.9) / 1.0) if average_word_length > 0 else 0.0
        ),
    }


def _weighted_score(signals: dict[str, float]) -> float:
    return sum(
        weight * _clamp(signals.get(name, 0.0)) for name, weight in RULES_WEIGHTS.items()
    )


def rules_probability(features: dict[str, float]) -> float:
    """Uncapped rules probability, used by the evaluation script before the policy cap."""
    raw = _weighted_score(rules_signals(features))
    return _sigmoid(RULES_GAIN * (raw - RULES_CENTER))


def feature_vector(features: dict[str, float]) -> list[float]:
    return [float(features.get(name, 0.0)) for name in AUTHORSHIP_FEATURE_ORDER]


def _learned(vector: list[float]) -> float | None:
    if not settings.use_learned_fusion:
        return None
    model = _load_model()
    if model is None:
        return None
    try:
        return float(model.predict_proba([vector])[0][1])
    except Exception:
        return None


@lru_cache(maxsize=1)
def _load_model() -> Any | None:
    path = settings.model_dir / "authorship.joblib"
    if not path.exists():
        return None
    if not _meta_feature_order_ok():
        return None
    _warn_on_version_skew()
    try:
        import joblib

        return joblib.load(path)
    except Exception:
        return None


def _meta_feature_order_ok() -> bool:
    """Refuse a model trained on a different vector layout instead of scoring garbage."""
    meta_path = settings.model_dir / "authorship.meta.json"
    try:
        stored = json.loads(meta_path.read_text(encoding="utf-8")).get("featureOrder")
    except Exception:
        logger.warning("authorship.meta.json is missing or unreadable; using rules scoring")
        return False
    if not isinstance(stored, list) or not feature_order_matches(stored):
        logger.warning(
            "authorship model feature order does not match AUTHORSHIP_FEATURE_ORDER; "
            "using rules scoring"
        )
        return False
    return True


def _warn_on_version_skew() -> None:
    """Pickled estimators expect the training library versions; surface drift once."""
    meta_path = settings.model_dir / "authorship.meta.json"
    try:
        import sklearn

        trained = json.loads(meta_path.read_text(encoding="utf-8")).get("sklearnVersion")
        if trained and trained != sklearn.__version__:
            logger.warning(
                "authorship model was trained with scikit-learn %s but %s is installed; "
                "re-run authorship training in this environment before enabling learned scoring",
                trained,
                sklearn.__version__,
            )
    except Exception:
        return


def score_features(features: dict[str, float]) -> AuthorshipResult:
    """Score one answer. The result can never exceed ``AUTHORSHIP_SCORE_CAP``."""
    signals = rules_signals(features)
    contributions = {
        name: round(weight * _clamp(signals.get(name, 0.0)) * 100.0, 2)
        for name, weight in RULES_WEIGHTS.items()
    }
    probability = rules_probability(features)
    learned_probability = _learned(feature_vector(features))
    learned = learned_probability is not None
    if learned_probability is not None:
        probability = learned_probability

    # The probability expresses review priority under the same policy cap as the score. Both
    # are clamped so an over-confident estimator cannot claim a 99% chance of machine origin.
    probability_cap = AUTHORSHIP_SCORE_CAP / 100.0
    clamped_probability = _clamp(probability, 0.0, probability_cap)
    score = round(clamped_probability * 100.0, 2)
    capped = probability > probability_cap

    return AuthorshipResult(
        score=min(AUTHORSHIP_SCORE_CAP, score),
        band=authorship_band(score),
        probability=round(clamped_probability, 4),
        signals=signals,
        contributions=contributions,
        learned=learned,
        capped=capped,
    )
