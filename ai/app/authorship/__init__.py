"""Deterministic stylometry for the AI-authorship review aid.

This package never proves authorship. It flags prose whose surface statistics resemble
machine-generated text so a human can read it. See ``docs/TRAINING.md`` for the caveats.
"""

from __future__ import annotations

from .classifier import (
    AUTHORSHIP_SCORE_CAP,
    AuthorshipResult,
    authorship_band,
    rules_probability,
    score_features,
)
from .features import AUTHORSHIP_FEATURE_ORDER, extract_features

__all__ = [
    "AUTHORSHIP_FEATURE_ORDER",
    "AUTHORSHIP_SCORE_CAP",
    "AuthorshipResult",
    "authorship_band",
    "extract_features",
    "rules_probability",
    "score_features",
]
