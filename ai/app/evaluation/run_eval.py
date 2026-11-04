"""Run pair and incident ablations on the synthetic cohort.

Usage:
    python -m app.evaluation.run_eval

This demonstrates the evaluation plumbing. The labels come from the simulator, so results measure
recovery of the simulation's rules, not real-world cheating detection.
"""

from __future__ import annotations

from ..services.analyzer import analyze_incidents, analyze_pairs
from .metrics import (
    average_precision,
    false_alarms_per_100,
    precision_at_k,
    precision_recall_f1,
    predictions_at,
    recall_at_k,
)
from .synthetic import build_incident_dataset, build_pair_dataset


def _canonical(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a <= b else (b, a)


def evaluate_pairs(feature_mode: str, threshold: float = 30.0) -> dict:
    request, labels = build_pair_dataset()
    response = analyze_pairs(request, feature_mode=feature_mode)

    scores = {key: 0.0 for key in labels}
    for finding in response.findings:
        scores[_canonical(finding.candidateA, finding.candidateB)] = finding.priorityScore

    keys = list(labels.keys())
    y_true = [labels[key] for key in keys]
    y_score = [scores[key] for key in keys]
    y_pred = predictions_at(y_score, threshold)
    precision, recall, f1 = precision_recall_f1(y_true, y_pred)

    return {
        "condition": feature_mode,
        "semantic": response.stats.get("semanticAvailable", False),
        "findings": len(response.findings),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "ap": average_precision(y_true, y_score),
        "p@10": precision_at_k(y_true, y_score, 10),
        "r@10": recall_at_k(y_true, y_score, 10),
        "falseAlarmsPer100": false_alarms_per_100(y_true, y_pred),
        "elapsedMs": response.stats.get("elapsedMs"),
    }


def evaluate_incidents(threshold: float = 10.0) -> dict:
    request, labels = build_incident_dataset()
    response = analyze_incidents(request)

    scores = {code: 0.0 for code in labels}
    for finding in response.findings:
        scores[finding.candidateA] = finding.priorityScore

    keys = list(labels.keys())
    y_true = [labels[key] for key in keys]
    y_score = [scores[key] for key in keys]
    y_pred = predictions_at(y_score, threshold)
    precision, recall, f1 = precision_recall_f1(y_true, y_pred)

    return {
        "condition": "rules+coverage+answer-change",
        "findings": len(response.findings),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "ap": average_precision(y_true, y_score),
        "falseAlarmsPer100": false_alarms_per_100(y_true, y_pred),
        "elapsedMs": response.stats.get("elapsedMs"),
    }


def _print_table(rows: list[dict]) -> None:
    headers = ["condition", "semantic", "findings", "precision", "recall", "f1", "ap",
               "p@10", "r@10", "falseAlarmsPer100"]
    widths = {h: max(len(h), *(len(str(row.get(h, ""))) for row in rows)) for h in headers}
    print("  ".join(h.ljust(widths[h]) for h in headers))
    print("  ".join("-" * widths[h] for h in headers))
    for row in rows:
        print("  ".join(str(row.get(h, "")).ljust(widths[h]) for h in headers))


def main() -> None:
    print("Pair ablations (synthetic cohort; labels are scripted)")
    pair_rows = [
        evaluate_pairs("content"),
        evaluate_pairs("content_patterns"),
        evaluate_pairs("full"),
    ]
    _print_table(pair_rows)

    print("\nIncident ablation (synthetic cohort; labels are scripted)")
    _print_table([evaluate_incidents()])

    print(
        "\nReminder: a learned fusion model trained on these labels would recover the simulator, "
        "not real misconduct. Use a consented pilot or held-out real cohorts for validity claims."
    )


if __name__ == "__main__":
    main()
