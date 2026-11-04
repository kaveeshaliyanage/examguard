"""Lexical similarity: word + character TF-IDF cosine, with a dependency-free fallback."""

from __future__ import annotations

import statistics

from .text import grams, jaccard, normalize, tokenize


def pairwise_similarity(texts: list[str]) -> tuple[list[list[float]], str]:
    n = len(texts)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        matrix[i][i] = 1.0

    indexes = [i for i, text in enumerate(texts) if len(normalize(text)) >= 8]
    if len(indexes) < 2:
        return matrix, "empty"

    corpus = [normalize(texts[i]) for i in indexes]

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        word_vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            sublinear_tf=True,
            min_df=1,
            token_pattern=r"(?u)\b[\w']+\b",
        )
        char_vectorizer = TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(3, 5),
            sublinear_tf=True,
            min_df=1,
        )
        word_matrix = cosine_similarity(word_vectorizer.fit_transform(corpus))
        char_matrix = cosine_similarity(char_vectorizer.fit_transform(corpus))
        combined = 0.55 * word_matrix + 0.45 * char_matrix

        for a, ia in enumerate(indexes):
            for b, ib in enumerate(indexes):
                matrix[ia][ib] = float(max(0.0, min(1.0, combined[a][b])))
        return matrix, "tfidf"
    except Exception:
        # Small corpora or missing scikit-learn: transparent token/char Jaccard fallback.
        for a in range(len(indexes)):
            for b in range(a + 1, len(indexes)):
                ia, ib = indexes[a], indexes[b]
                ta, tb = set(tokenize(texts[ia])), set(tokenize(texts[ib]))
                token_score = jaccard(ta, tb)
                char_score = jaccard(set(grams(texts[ia], 3)), set(grams(texts[ib], 3)))
                score = 0.6 * token_score + 0.4 * char_score
                matrix[ia][ib] = matrix[ib][ia] = float(max(0.0, min(1.0, score)))
        return matrix, "jaccard"


def cohort_stats(values: list[float]) -> tuple[float, float]:
    clean = [v for v in values if v > 0]
    if not clean:
        return 0.0, 0.0
    mean = statistics.fmean(clean)
    std = statistics.pstdev(clean) if len(clean) > 1 else 0.0
    return mean, std
