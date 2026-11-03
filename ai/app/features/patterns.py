"""Distinctive shared patterns: rare n-grams, rare tokens, spelling variants, cross-question reuse."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from ..schemas import PairCandidate
from .text import (
    content_tokens,
    levenshtein,
    shingle_text,
    shingles,
)

NGRAM_SIZES = (3, 4, 5)


@dataclass
class PatternPair:
    rare_score: float = 0.0
    cross_score: float = 0.0
    shared_shingles: list[str] = field(default_factory=list)
    shared_tokens: list[str] = field(default_factory=list)
    spelling_variants: list[str] = field(default_factory=list)
    cross_shingles: list[str] = field(default_factory=list)
    per_question: dict[int, dict] = field(default_factory=dict)


def _candidate_shingles(candidates: list[PairCandidate], question_id: int) -> dict[str, set[tuple[str, ...]]]:
    result: dict[str, set[tuple[str, ...]]] = {}
    for candidate in candidates:
        answer = next((a for a in candidate.answers if a.questionId == question_id), None)
        tokens = content_tokens(answer.text if answer else "")
        parts: set[tuple[str, ...]] = set()
        for n in NGRAM_SIZES:
            parts |= shingles(tokens, n)
        result[candidate.candidateCode] = parts
    return result


def _candidate_tokens(candidates: list[PairCandidate], question_id: int) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for candidate in candidates:
        answer = next((a for a in candidate.answers if a.questionId == question_id), None)
        result[candidate.candidateCode] = {
            token for token in content_tokens(answer.text if answer else "") if len(token) >= 5
        }
    return result


def _rare_sets(candidates: list[PairCandidate], question_ids: list[int], df_max: int):
    """Return rare sets per (candidate, question) plus document frequencies for ranking."""
    rare_shingles: dict[str, dict[int, set[tuple[str, ...]]]] = {
        c.candidateCode: {} for c in candidates
    }
    rare_tokens: dict[str, dict[int, set[str]]] = {c.candidateCode: {} for c in candidates}
    shingle_df_by_question: dict[int, dict[tuple[str, ...], int]] = {}
    token_df_by_question: dict[int, dict[str, int]] = {}

    for qid in question_ids:
        shingle_map = _candidate_shingles(candidates, qid)
        token_map = _candidate_tokens(candidates, qid)

        shingle_df: dict[tuple[str, ...], int] = defaultdict(int)
        for values in shingle_map.values():
            for shingle in values:
                shingle_df[shingle] += 1

        token_df: dict[str, int] = defaultdict(int)
        for values in token_map.values():
            for token in values:
                token_df[token] += 1

        # Keep only the rare items this candidate actually used. Filtering the document
        # frequencies alone would give every candidate the same set and make every pair
        # look equally distinctive.
        for code, values in shingle_map.items():
            rare_shingles[code][qid] = {
                shingle for shingle in values if shingle_df[shingle] <= df_max
            }
        for code, values in token_map.items():
            rare_tokens[code][qid] = {
                token for token in values if token_df[token] <= max(2, df_max)
            }

        shingle_df_by_question[qid] = dict(shingle_df)
        token_df_by_question[qid] = dict(token_df)

    return rare_shingles, rare_tokens, shingle_df_by_question, token_df_by_question


def compute_patterns(
    candidates: list[PairCandidate],
    question_ids: list[int],
    df_max: int = 3,
) -> dict[tuple[str, str], PatternPair]:
    (
        rare_shingles,
        rare_tokens,
        shingle_df,
        token_df,
    ) = _rare_sets(candidates, question_ids, df_max)
    results: dict[tuple[str, str], PatternPair] = {}

    codes = [c.candidateCode for c in candidates]
    for i in range(len(codes)):
        for j in range(i + 1, len(codes)):
            a, b = codes[i], codes[j]
            pair = PatternPair()
            containments: list[float] = []
            all_shared: set[tuple[str, ...]] = set()
            all_shared_tokens: set[str] = set()
            shared_freq: dict[tuple[str, ...], int] = {}
            shared_token_freq: dict[str, int] = {}

            for qid in question_ids:
                sa, sb = rare_shingles[a][qid], rare_shingles[b][qid]
                ta, tb = rare_tokens[a][qid], rare_tokens[b][qid]
                shared = sa & sb
                shared_tokens = ta & tb
                if sa and sb:
                    containments.append(len(shared) / min(len(sa), len(sb)))
                all_shared |= shared
                all_shared_tokens |= shared_tokens
                for shingle in shared:
                    frequency = shingle_df[qid].get(shingle, df_max + 1)
                    shared_freq[shingle] = min(shared_freq.get(shingle, frequency), frequency)
                for token in shared_tokens:
                    frequency = token_df[qid].get(token, df_max + 1)
                    shared_token_freq[token] = min(
                        shared_token_freq.get(token, frequency), frequency
                    )
                pair.per_question[qid] = {
                    "sharedShingles": len(shared),
                    "sharedTokens": len(shared_tokens),
                }

            if containments:
                pair.rare_score = min(1.0, 0.7 * max(containments) + 0.3 * sum(containments) / len(containments))

            cross: set[tuple[str, ...]] = set()
            for qa in question_ids:
                for qb in question_ids:
                    if qa == qb:
                        continue
                    cross |= rare_shingles[a][qa] & rare_shingles[b][qb]

            # Surface the rarest wording first; a long shared sentence is less distinctive.
            pair.shared_shingles = [
                shingle_text(s)
                for s in sorted(
                    all_shared, key=lambda s: (shared_freq.get(s, 0), -len(s))
                )[:6]
            ]
            pair.shared_tokens = sorted(
                all_shared_tokens,
                key=lambda token: (shared_token_freq.get(token, 0), -len(token), token),
            )[:8]
            pair.cross_shingles = [shingle_text(s) for s in sorted(cross, key=len, reverse=True)[:4]]
            pair.cross_score = min(1.0, len(cross) / 4.0)

            variants: set[str] = set()
            # Near-miss spellings: rare tokens that differ by at most one edit.
            token_pool_a = {t for q in question_ids for t in rare_tokens[a][q]}
            token_pool_b = {t for q in question_ids for t in rare_tokens[b][q]}
            for token_a in sorted(token_pool_a):
                for token_b in sorted(token_pool_b):
                    if token_a == token_b:
                        continue
                    if len(token_a) >= 7 and len(token_b) >= 7 and levenshtein(token_a, token_b, cutoff=1) <= 1:
                        variants.add(f"{token_a}/{token_b}")
                    if len(variants) >= 5:
                        break
                if len(variants) >= 5:
                    break
            pair.spelling_variants = sorted(variants)[:5]
            results[(a, b)] = pair

    return results
