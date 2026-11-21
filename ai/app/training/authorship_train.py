"""Train the authorship classifier on exported stylometry rows.

    python -m app.training.authorship_export --out data-authorship --seed 7
    python -m app.training.authorship_train --data data-authorship --out models --seed 7

Artifacts: ``models/authorship.joblib``, ``models/authorship.meta.json`` and
``models/authorship.MODEL_CARD.md``. The runtime loads the model only when
``USE_LEARNED_FUSION=true`` and the metadata feature order matches the runtime order.

The estimator is scikit-learn. The lightgbm version is recorded when lightgbm happens to be
installed so the environment is reproducible, but no lightgbm estimator is trained.
"""

from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, precision_recall_fscore_support
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ..authorship.classifier import (
    AUTHORSHIP_SCORE_CAP,
    HUMAN_FUNCTION_WORD_PRIOR,
    RULES_CENTER,
    RULES_GAIN,
    RULES_WEIGHTS,
)
from ..authorship.features import AUTHORSHIP_FEATURE_ORDER
from .authorship_eval import auroc, expected_calibration_error, tpr_at_fpr

SPLIT_FRACTIONS = (0.7, 0.15, 0.15)


def _load_rows(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def split_by_author(
    rows: list[dict], seed: int
) -> tuple[list[dict], list[dict], list[dict]]:
    """Group by author/cohort so one author never straddles train and test."""
    authors = sorted({row.get("authorId") or row["cohort"] for row in rows})
    random.Random(f"{seed}-authorship-split").shuffle(authors)
    n = len(authors)
    if n == 0:
        return [], [], []
    train_end = max(1, int(n * SPLIT_FRACTIONS[0]))
    val_end = max(train_end, min(n, int(n * (SPLIT_FRACTIONS[0] + SPLIT_FRACTIONS[1]))))
    train_authors = set(authors[:train_end])
    val_authors = set(authors[train_end:val_end])
    test_authors = set(authors[val_end:])

    def pick(group: set[str]) -> list[dict]:
        return [row for row in rows if (row.get("authorId") or row["cohort"]) in group]

    return pick(train_authors), pick(val_authors), pick(test_authors)


def _vector(row: dict, order: list[str]) -> list[float]:
    return [float(row["features"].get(name, 0.0)) for name in order]


def _pick_threshold(labels: np.ndarray, scores: np.ndarray) -> float:
    best, best_threshold = -1.0, 0.5
    for threshold in np.linspace(0.05, 0.95, 91):
        _, _, f1, _ = precision_recall_fscore_support(
            labels, (scores >= threshold).astype(int), average="binary", zero_division=0
        )
        if f1 > best:
            best, best_threshold = f1, float(threshold)
    return round(best_threshold, 4)


def _lightgbm_version() -> str | None:
    try:
        import lightgbm

        return lightgbm.__version__
    except Exception:
        return None


def _metrics(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict:
    predictions = (scores >= threshold).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, predictions, average="binary", zero_division=0
    )
    label_list = [int(value) for value in labels]
    score_list = [float(value) for value in scores]
    return {
        "rows": len(label_list),
        "positives": int(labels.sum()),
        "auroc": round(auroc(label_list, score_list), 4),
        "tprAt5Fpr": round(tpr_at_fpr(label_list, score_list), 4),
        "ece": round(expected_calibration_error(label_list, score_list), 4),
        "brier": round(float(brier_score_loss(labels, scores)), 4),
        "precisionAtThreshold": round(float(precision), 4),
        "recallAtThreshold": round(float(recall), 4),
        "f1AtThreshold": round(float(f1), 4),
    }


def train_authorship(
    rows: list[dict],
    *,
    feature_order: list[str],
    out_dir: Path,
    seed: int,
    dataset: dict,
) -> dict:
    if list(feature_order) != AUTHORSHIP_FEATURE_ORDER:
        raise SystemExit("dataset feature order does not match AUTHORSHIP_FEATURE_ORDER")

    train, val, test = split_by_author(rows, seed)
    if not train:
        raise SystemExit("authorship training split is empty")
    x_train = np.array([_vector(row, feature_order) for row in train])
    y_train = np.array([row["label"] for row in train])
    x_val = np.array([_vector(row, feature_order) for row in val])
    y_val = np.array([row["label"] for row in val])
    x_test = np.array([_vector(row, feature_order) for row in test])
    y_test = np.array([row["label"] for row in test])

    if y_train.sum() == 0 or y_train.sum() == len(y_train):
        raise SystemExit("authorship training split has a single class; generate more cohorts")

    estimator = make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=4000, class_weight="balanced", random_state=seed),
    )
    model = CalibratedClassifierCV(estimator, method="sigmoid", cv=3)
    model.fit(x_train, y_train)
    if list(model.classes_) != [0, 1]:
        raise SystemExit(f"authorship: unexpected class order {model.classes_}")

    threshold = _pick_threshold(y_val, model.predict_proba(x_val)[:, 1])
    test_scores = model.predict_proba(x_test)[:, 1]
    metrics = _metrics(y_test, test_scores, threshold)

    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out_dir / "authorship.joblib")

    metadata = {
        "kind": "authorship",
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "featureOrder": feature_order,
        "estimator": "CalibratedClassifierCV(StandardScaler+LogisticRegression, sigmoid)",
        "sklearnVersion": sklearn.__version__,
        "numpyVersion": np.__version__,
        "lightgbmVersion": _lightgbm_version(),
        "dataset": dataset,
        "splits": {
            "train": len(train),
            "validation": len(val),
            "test": len(test),
            "splitBy": "author/cohort",
        },
        "threshold": threshold,
        "metrics": metrics,
        "scoreCap": AUTHORSHIP_SCORE_CAP,
        "bandCeiling": "MEDIUM",
        "rulesBaseline": {
            "weights": RULES_WEIGHTS,
            "center": RULES_CENTER,
            "gain": RULES_GAIN,
            "functionWordPrior": HUMAN_FUNCTION_WORD_PRIOR,
        },
        "synthetic": bool(dataset.get("synthetic", True)),
        "detectsMachineGeneratedProse": True,
        "detectsCopying": False,
        "scoreSemantics": (
            "Capped review priority for machine-like prose. Not a probability of misconduct, "
            "not evidence that AI was used, and not a measure of copying."
        ),
    }
    (out_dir / "authorship.meta.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


def _model_card(metadata: dict, manifest: dict) -> str:
    metrics = metadata["metrics"]
    dataset = metadata["dataset"]
    weights = "\n".join(
        f"| {name} | {weight:.2f} |" for name, weight in RULES_WEIGHTS.items()
    )
    return f"""# ExamGuard authorship model (review aid)

Trained {metadata['trainedAt']} from {manifest['generatorVersion']} synthetic cohorts.

## What this model does

It scores prose for how much it resembles **machine-generated text** on stylometric evidence:
sentence rhythm, contraction use, punctuation, repeated bigrams, drafting dynamics and
function-word mix. The output is capped at **{AUTHORSHIP_SCORE_CAP:.0f}/100**, so the highest
possible band is MEDIUM. It is a routing signal for a human reader.

It does **not** detect copied work. Copying is the pair-similarity model's job. A high
authorship score is not proof of AI use and must never be presented as misconduct evidence.

## Data

- Source: `app/training/authorship_cohorts.py`, seeded synthetic human-like and
  machine-like paragraphs.
- Rows: {dataset.get('rows')} ({dataset.get('positives')} machine-like,
  positive rate {dataset.get('positiveRate')}).
- Splits are grouped by author/cohort (70/15/15), never by row.
- **The metrics below are synthetic.** They measure recovery of the simulator's style
  contrast, not real-world authorship detection.

## Held-out metrics

| Metric | Value |
| --- | --- |
| AUROC | {metrics['auroc']} |
| TPR @ 5% FPR | {metrics['tprAt5Fpr']} |
| Expected calibration error | {metrics['ece']} |
| Brier | {metrics['brier']} |
| Precision @ threshold | {metrics['precisionAtThreshold']} |
| Recall @ threshold | {metrics['recallAtThreshold']} |
| Threshold | {metadata['threshold']} |

Evaluation gates for CI: AUROC 0.80, TPR@5%FPR 0.55, ECE 0.05
(`app/training/authorship_eval.py` exits non-zero below them).

## Rules baseline weights

The runtime falls back to this transparent baseline when `USE_LEARNED_FUSION` is false or the
artifact is missing, or when the metadata feature order does not match. Weighted signals are
passed through a logistic link with center {RULES_CENTER} and gain {RULES_GAIN}.

| Signal | Weight |
| --- | --- |
{weights}

## Limits that matter

1. **Synthetic circularity.** The labels and the features both come from the same simulator.
   The metrics show the pipeline is wired correctly, not that the detector is valid.
2. **Domain shift.** Function words, punctuation and drafting habits vary by subject,
   language and assessment type. Re-validate on a licensed corpus with author ids.
3. **False accusations.** Machine-like prose can be written by a careful human, a non-native
   speaker, or a template-heavy discipline. The cap and the band ceiling are policy controls,
   not a calibration guarantee.
4. **No copying claim.** Stylometry says nothing about whether two candidates share an answer.

## Reproduce

```bash
cd ai
python -m app.training.authorship_export --out data-authorship --cohorts 200 --seed {manifest['seed']}
python -m app.training.authorship_train --data data-authorship --out models --seed {manifest['seed']}
python -m app.training.authorship_eval --data data-authorship/authorship.jsonl \\
    --model models/authorship.joblib
```
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the authorship classifier")
    parser.add_argument("--data", type=Path, default=Path("data-authorship"))
    parser.add_argument("--out", type=Path, default=Path("models"))
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    manifest = json.loads((args.data / "manifest.json").read_text(encoding="utf-8"))
    rows = _load_rows(args.data / manifest["rows"]["file"])
    args.out.mkdir(parents=True, exist_ok=True)

    metadata = train_authorship(
        rows,
        feature_order=manifest["rows"]["featureOrder"],
        out_dir=args.out,
        seed=args.seed,
        dataset=manifest["rows"],
    )
    (args.out / "authorship.MODEL_CARD.md").write_text(
        _model_card(metadata, manifest), encoding="utf-8"
    )
    print(
        f"authorship: AUROC={metadata['metrics']['auroc']} "
        f"TPR@5%FPR={metadata['metrics']['tprAt5Fpr']} "
        f"ECE={metadata['metrics']['ece']} threshold={metadata['threshold']}"
    )


if __name__ == "__main__":
    main()
