"""Small text utilities shared by feature modules. Keep this dependency-free."""

from __future__ import annotations

import re
from collections import Counter
from difflib import SequenceMatcher
from itertools import combinations

TOKEN_RE = re.compile(r"[a-z0-9']+")

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "because", "but", "by", "can", "could",
    "do", "does", "for", "from", "has", "have", "how", "if", "in", "into", "is", "it",
    "its", "may", "not", "of", "on", "or", "our", "that", "the", "their", "then", "there",
    "these", "this", "to", "was", "we", "were", "what", "when", "which", "while", "will",
    "with", "would", "you", "your", "one", "two", "also", "than", "them", "they", "use",
    "used", "using", "more", "most", "such", "only", "other", "some", "any", "all", "each",
}


def normalize(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def tokenize(text: str | None) -> list[str]:
    return TOKEN_RE.findall(normalize(text).lower())


def content_tokens(text: str | None) -> list[str]:
    return [t for t in tokenize(text) if t not in STOPWORDS and len(t) > 1]


def word_count(text: str | None) -> int:
    return len(tokenize(text))


def shingles(tokens: list[str], n: int) -> set[tuple[str, ...]]:
    if len(tokens) < n:
        return set()
    return {tuple(tokens[i:i + n]) for i in range(len(tokens) - n + 1)}


def shingle_text(shingle: tuple[str, ...]) -> str:
    return " ".join(shingle)


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def containment(a: set, b: set) -> float:
    """How much of the smaller set is contained in the larger one."""
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def sequence_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a).lower(), normalize(b).lower()).ratio()


def levenshtein(a: str, b: str, cutoff: int = 2) -> int:
    """Bounded Levenshtein distance; returns cutoff + 1 when clearly too different."""
    if a == b:
        return 0
    if abs(len(a) - len(b)) > cutoff:
        return cutoff + 1
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        row_min = i
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            value = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            current.append(value)
            row_min = min(row_min, value)
        if row_min > cutoff:
            return cutoff + 1
        previous = current
    return previous[-1]


def grams(text: str, n: int) -> list[str]:
    cleaned = normalize(text).lower()
    return [cleaned[i:i + n] for i in range(max(0, len(cleaned) - n + 1))]


def top_counter(items: list[str], limit: int = 5) -> list[str]:
    return [item for item, _ in Counter(items).most_common(limit)]


def pair_indices(size: int):
    return combinations(range(size), 2)
