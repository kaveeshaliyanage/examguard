"""Evaluate the authorship classifier and gate CI on AUROC, TPR@5%FPR and calibration.

    python -m app.training.authorship_eval --data data-authorship/authorship.jsonl \
        --model models/authorship.joblib

The script exits non-zero when AUROC < 0.80, TPR at 5% false-positive rate < 0.55 or expected
calibration error > 0.05, so a regression fails the build. Metrics are computed from exported
feature rows with no network access.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Callable

from ..authorship.classifier import rules_probability
from ..authorship.features import AUTHORSHIP_FEATURE_ORDER, feature_order_matches

GATES = {"auroc": 0.80, "tprAt5Fpr": 0.55, "ece": 0.05}
ECE_BINS = 15


def auroc(y_true: list[int], y_score: list[float]) -> float:
    positives = sum(y_true)
    negatives = len(y_true) - positives
    if positives == 0 or negatives == 0:
        return 0.5
    order = sorted(zip(y_score, y_true))
    ranks: list[float] = [0.0] * len(order)
    index = 0
    while index < len(order):
        end = index
        while end + 1 < len(order) and order[end + 1][0] == order[index][0]:
            end += 1
        average_rank = (index + 1 + end + 1) / 2.0
        for position in range(index, end + 1):
            ranks[position] = average_rank
        index = end + 1
    positive_rank_sum = sum(
        rank for (_, label), rank in zip(order, ranks) if label == 1
    )
    return (
        positive_rank_sum - positives * (positives + 1) / 2.0
    ) / (positives * negatives)


def tpr_at_fpr(
    y_true: list[int], y_score: list[float], max_fpr: float = 0.05
) -> float:
    positives = sum(y_true)
    negatives = len(y_true) - positives
    if positives == 0 or negatives == 0:
        return 0.0
    best = 0.0
    for threshold in sorted(set(y_score), reverse=True):
        true_positives = sum(
            1 for score, label in zip(y_score, y_true) if score >= threshold and label == 1
        )
        false_positives = sum(
            1 for score, label in zip(y_score, y_true) if score >= threshold and label == 0
        )
        if false_positives / negatives <= max_fpr:
            best = max(best, true_positives / positives)
    return best


def expected_calibration_error(
    y_true: list[int], y_score: list[float], bins: int = ECE_BINS
) -> float:
    if not y_true:
        return 0.0
    totals = [0] * bins
    confidences = [0.0] * bins
    accuracies = [0.0] * bins
    for label, score in zip(y_true, y_score):
        index = min(bins - 1, max(0, int(score * bins)))
        totals[index] += 1
        confidences[index] += score
        accuracies[index] += label
    error = 0.0
    for count, confidence, accuracy in zip(totals, confidences, accuracies):
        if count == 0:
            continue
        error += count / len(y_true) * abs(accuracy / count - confidence / count)
    return error


def evaluate_rows(
    rows: list[dict],
    predictor: Callable[[dict[str, float]], float],
) -> dict:
    labels = [int(row["label"]) for row in rows]
    scores = [float(predictor(row["features"])) for row in rows]
    return {
        "rows": len(rows),
        "positives": sum(labels),
        "positiveRate": round(sum(labels) / len(labels), 4) if labels else 0.0,
        "auroc": round(auroc(labels, scores), 4),
        "tprAt5Fpr": round(tpr_at_fpr(labels, scores), 4),
        "ece": round(expected_calibration_error(labels, scores), 4),
    }


def gate_metrics(metrics: dict, gates: dict | None = None) -> list[str]:
    thresholds = gates or GATES
    failures: list[str] = []
    if metrics.get("auroc", 0.0) < thresholds["auroc"]:
        failures.append(
            f"auroc {metrics.get('auroc')} < {thresholds['auroc']}"
        )
    if metrics.get("tprAt5Fpr", 0.0) < thresholds["tprAt5Fpr"]:
        failures.append(
            f"tprAt5Fpr {metrics.get('tprAt5Fpr')} < {thresholds['tprAt5Fpr']}"
        )
    if metrics.get("ece", 1.0) > thresholds["ece"]:
        failures.append(f"ece {metrics.get('ece')} > {thresholds['ece']}")
    return failures


def enforce_gates(metrics: dict, gates: dict | None = None) -> None:
    failures = gate_metrics(metrics, gates)
    if failures:
        raise SystemExit("authorship evaluation gate failed: " + "; ".join(failures))


def _load_rows(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _model_predictor(model_path: Path) -> Callable[[dict[str, float]], float]:
    meta_path = model_path.with_suffix(".meta.json")
    if meta_path.exists():
        stored = json.loads(meta_path.read_text(encoding="utf-8")).get("featureOrder")
        if not isinstance(stored, list) or not feature_order_matches(stored):
            raise SystemExit("model feature order does not match AUTHORSHIP_FEATURE_ORDER")

    import joblib

    model = joblib.load(model_path)

    def predict(features: dict[str, float]) -> float:
        vector = [float(features.get(name, 0.0)) for name in AUTHORSHIP_FEATURE_ORDER]
        return float(model.predict_proba([vector])[0][1])

    return predict


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the authorship classifier")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--model", type=Path, default=None)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    rows = _load_rows(args.data)
    predictor = (
        _model_predictor(args.model) if args.model is not None else rules_probability
    )
    metrics = evaluate_rows(rows, predictor)
    failures = gate_metrics(metrics)
    report = {
        "condition": "learned" if args.model is not None else "rules",
        "metrics": metrics,
        "gates": GATES,
        "passed": not failures,
        "failures": failures,
        "warning": (
            "Synthetic rows measure recovery of the simulator's style contrast, not "
            "real-world authorship detection."
        ),
    }
    print(json.dumps(report, indent=2))
    if args.report is not None:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    enforce_gates(metrics)


if __name__ == "__main__":
    main()
