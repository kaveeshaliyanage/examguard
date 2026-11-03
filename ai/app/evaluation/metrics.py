"""Ranking metrics without a scikit-learn dependency."""

from __future__ import annotations


def precision_recall_f1(y_true: list[int], y_pred: list[int]) -> tuple[float, float, float]:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return round(precision, 4), round(recall, 4), round(f1, 4)


def predictions_at(y_score: list[float], threshold: float) -> list[int]:
    return [1 if score >= threshold else 0 for score in y_score]


def average_precision(y_true: list[int], y_score: list[float]) -> float:
    if not y_true or sum(y_true) == 0:
        return 0.0
    order = sorted(range(len(y_score)), key=lambda i: y_score[i], reverse=True)
    hits = 0
    precision_sum = 0.0
    for rank, index in enumerate(order, start=1):
        if y_true[index] == 1:
            hits += 1
            precision_sum += hits / rank
    return round(precision_sum / sum(y_true), 4)


def precision_at_k(y_true: list[int], y_score: list[float], k: int) -> float:
    if k <= 0 or not y_true:
        return 0.0
    order = sorted(range(len(y_score)), key=lambda i: y_score[i], reverse=True)[:k]
    if not order:
        return 0.0
    return round(sum(y_true[i] for i in order) / len(order), 4)


def recall_at_k(y_true: list[int], y_score: list[float], k: int) -> float:
    positives = sum(y_true)
    if positives == 0 or k <= 0:
        return 0.0
    order = sorted(range(len(y_score)), key=lambda i: y_score[i], reverse=True)[:k]
    return round(sum(y_true[i] for i in order) / positives, 4)


def false_alarms_per_100(y_true: list[int], y_pred: list[int]) -> float:
    """False-positive predictions per 100 items (candidates or pairs), as documented.

    The denominator is every evaluated item, not only negatives. This matches the workload
    framing used in docs/EVALUATION.md: 100 candidates produce 4,950 pairs, so a 1% false
    positive rate is about 50 pairs to review.
    """
    if not y_true:
        return 0.0
    false_positives = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    return round(false_positives / len(y_true) * 100.0, 2)
