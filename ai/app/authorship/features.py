"""Deterministic stylometric features for the authorship review aid.

Nothing here uses the network, a model or randomness: the same text and revisions always
produce the same vector. All rates are per token and every division is guarded, so empty or
very short text yields zeros instead of an exception.

Feature order is exported as ``AUTHORSHIP_FEATURE_ORDER``. Training writes it into
``authorship.meta.json``; the runtime refuses a model whose metadata disagrees, exactly like
the fusion models reject an unexpected feature layout.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from statistics import fmean, pvariance
from typing import Sequence

from ..schemas import AuthorshipRevision
from ..features.text import normalize, tokenize

FUNCTION_WORDS = ("the", "of", "and", "to", "in", "that", "is", "it", "for", "with")
FUNCTION_WORD_FEATURES = tuple(f"functionWord_{word}" for word in FUNCTION_WORDS)

AUTHORSHIP_FEATURE_ORDER: list[str] = [
    "sentenceLengthMean",
    "sentenceLengthVariance",
    "burstiness",
    "typeTokenRatio",
    "hapaxRatio",
    "commaRate",
    "semicolonRate",
    "dashRate",
    "parenthesisRate",
    "contractionRate",
    "averageWordLength",
    "repeatedBigramRate",
    "paragraphLengthVariance",
    "revisionCount",
    "meanWordsAddedPerRevision",
    "finalFirstWordRatio",
    *FUNCTION_WORD_FEATURES,
]

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
PARAGRAPH_SPLIT_RE = re.compile(r"\n\s*\n")
DASH_RE = re.compile(r"[\u2014\u2013]| - ")

MAX_FINAL_FIRST_RATIO = 20.0


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def _round(value: float) -> float:
    return round(float(value), 6)


def _sentence_lengths(text: str) -> list[int]:
    sentences = [part for part in SENTENCE_SPLIT_RE.split(text) if part.strip()]
    lengths = [len(tokenize(sentence)) for sentence in sentences]
    lengths = [length for length in lengths if length > 0]
    if not lengths:
        tokens = tokenize(text)
        return [len(tokens)] if tokens else []
    return lengths


def _paragraph_lengths(raw: str) -> list[int]:
    paragraphs = [part for part in PARAGRAPH_SPLIT_RE.split(raw) if part.strip()]
    lengths = [len(tokenize(paragraph)) for paragraph in paragraphs]
    return [length for length in lengths if length > 0]


def _revisions_in_order(revisions: Sequence[AuthorshipRevision]) -> list[AuthorshipRevision]:
    return sorted(revisions, key=lambda revision: revision.revisionNo)


def _effective_text(text: str | None, revisions: Sequence[AuthorshipRevision]) -> str:
    normalized = normalize(text)
    if normalized:
        return normalized
    if revisions:
        return normalize(_revisions_in_order(revisions)[-1].text)
    return ""


def _revision_dynamics(revisions: Sequence[AuthorshipRevision]) -> tuple[float, float, float]:
    """(count, mean words added per revision, final/first word ratio).

    With no revisions the tuple is all zeros so the feature vector keeps a fixed shape.
    A single revision has no "added" deltas, so the mean is zero as well.
    """
    if not revisions:
        return 0.0, 0.0, 0.0
    ordered = _revisions_in_order(revisions)
    counts = [len(tokenize(revision.text)) for revision in ordered]
    added = [max(0, counts[index] - counts[index - 1]) for index in range(1, len(counts))]
    mean_added = fmean(added) if added else 0.0
    final_first = min(MAX_FINAL_FIRST_RATIO, _safe_ratio(counts[-1], counts[0]))
    return float(len(ordered)), mean_added, final_first


def extract_features(
    text: str | None,
    revisions: Sequence[AuthorshipRevision] | None = None,
) -> dict[str, float]:
    """Build the fixed-order feature vector for one answer.

    ``revisions`` supplies the drafting dynamics. When it is omitted the three revision
    features are zero; that is a statement about missing data, not a human-like signal.
    """
    revision_list = list(revisions or [])
    effective = _effective_text(text, revision_list)
    if text and text.strip():
        # Paragraph structure lives in the raw newlines; normalize() collapses them.
        raw = text
    elif revision_list:
        raw = _revisions_in_order(revision_list)[-1].text
    else:
        raw = ""
    tokens = tokenize(effective)
    token_count = len(tokens)

    sentence_lengths = _sentence_lengths(effective)
    sentence_mean = fmean(sentence_lengths) if sentence_lengths else 0.0
    sentence_variance = pvariance(sentence_lengths) if len(sentence_lengths) > 1 else 0.0
    sentence_std = math.sqrt(sentence_variance)
    burstiness = (
        (sentence_std - sentence_mean) / (sentence_std + sentence_mean)
        if sentence_std + sentence_mean > 0
        else 0.0
    )

    counts = Counter(tokens)
    type_token = _safe_ratio(len(counts), token_count)
    hapax = _safe_ratio(sum(1 for count in counts.values() if count == 1), token_count)

    bigrams = list(zip(tokens, tokens[1:]))
    repeated_bigrams = _safe_ratio(len(bigrams) - len(set(bigrams)), len(bigrams))

    paragraph_lengths = _paragraph_lengths(raw)
    paragraph_variance = (
        pvariance(paragraph_lengths) if len(paragraph_lengths) > 1 else 0.0
    )

    revision_count, mean_added, final_first = _revision_dynamics(revision_list)

    features = {
        "sentenceLengthMean": _round(sentence_mean),
        "sentenceLengthVariance": _round(sentence_variance),
        "burstiness": _round(burstiness),
        "typeTokenRatio": _round(type_token),
        "hapaxRatio": _round(hapax),
        "commaRate": _round(_safe_ratio(effective.count(","), token_count)),
        "semicolonRate": _round(_safe_ratio(effective.count(";"), token_count)),
        "dashRate": _round(_safe_ratio(len(DASH_RE.findall(effective)), token_count)),
        "parenthesisRate": _round(_safe_ratio(effective.count("("), token_count)),
        "contractionRate": _round(
            _safe_ratio(sum(1 for token in tokens if "'" in token), token_count)
        ),
        "averageWordLength": _round(fmean(len(token) for token in tokens) if tokens else 0.0),
        "repeatedBigramRate": _round(repeated_bigrams),
        "paragraphLengthVariance": _round(paragraph_variance),
        "revisionCount": _round(revision_count),
        "meanWordsAddedPerRevision": _round(mean_added),
        "finalFirstWordRatio": _round(final_first),
        **{
            feature: _round(_safe_ratio(counts.get(word, 0), token_count))
            for feature, word in zip(FUNCTION_WORD_FEATURES, FUNCTION_WORDS)
        },
    }
    # Guard the contract: every consumer indexes by position, so a missing or extra key is
    # a programming error rather than a data problem.
    if list(features) != AUTHORSHIP_FEATURE_ORDER:
        raise ValueError("authorship feature extraction produced an unexpected key order")
    return features


def feature_order_matches(order: Sequence[str]) -> bool:
    """True when a stored feature order is exactly the runtime order."""
    return list(order) == AUTHORSHIP_FEATURE_ORDER
