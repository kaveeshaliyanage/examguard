"""Train the pair and incident fusion models on exported feature rows.

    python -m app.training.export --out data
    python -m app.training.train --data data --out models

Artifacts are named ``{kind}_fusion.joblib`` so ``app.features.fusion._load_model`` picks them up
when ``USE_LEARNED_FUSION=true``.
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
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SPLIT_FRACTIONS = (0.7, 0.15, 0.15)
REVIEW_BUDGET = 0.10


def _load_rows(path: Path) -> list[dict]:
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _split_by_cohort(rows: list[dict], seed: int) -> tuple[list[dict], list[dict], list[dict]]:
    cohorts = sorted({row["cohort"] for row in rows})
    random.Random(f"{seed}-split").shuffle(cohorts)
    n = len(cohorts)
    train_end = max(1, int(n * SPLIT_FRACTIONS[0]))
    val_end = max(train_end + 1, int(n * (SPLIT_FRACTIONS[0] + SPLIT_FRACTIONS[1])))
    train_set = set(cohorts[:train_end])
    val_set = set(cohorts[train_end:val_end])
    test_set = set(cohorts[val_end:])
    train = [row for row in rows if row["cohort"] in train_set]
    val = [row for row in rows if row["cohort"] in val_set]
    test = [row for row in rows if row["cohort"] in test_set]
    return train, val, test


def _vector(row: dict, order: list[str]) -> list[float]:
    return [float(row["features"].get(name, 0.0)) for name in order]


def _metrics(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict:
    predictions = (scores >= threshold).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, predictions, average="binary", zero_division=0
    )
    budget = max(1, int(len(scores) * REVIEW_BUDGET))
    top = np.argsort(scores)[::-1][:budget]
    single_class = len(set(labels.tolist())) < 2
    return {
        "rows": int(len(labels)),
        "positives": int(labels.sum()),
        "averagePrecision": None if single_class else round(float(average_precision_score(labels, scores)), 4),
        "rocAuc": None if single_class else round(float(roc_auc_score(labels, scores)), 4),
        "brier": round(float(brier_score_loss(labels, scores)), 4),
        "precisionAtThreshold": round(float(precision), 4),
        "recallAtThreshold": round(float(recall), 4),
        "f1AtThreshold": round(float(f1), 4),
        "reviewBudget": REVIEW_BUDGET,
        "precisionAtBudget": round(float(labels[top].mean()), 4),
        "recallAtBudget": round(float(labels[top].sum() / max(1, labels.sum())), 4),
        "meanScorePositive": round(float(scores[labels == 1].mean()), 4) if (labels == 1).any() else None,
        "meanScoreNegative": round(float(scores[labels == 0].mean()), 4) if (labels == 0).any() else None,
    }


def _pick_threshold(labels: np.ndarray, scores: np.ndarray) -> float:
    best, best_threshold = -1.0, 0.5
    for threshold in np.linspace(0.05, 0.95, 91):
        _, _, f1, _ = precision_recall_fscore_support(
            labels, (scores >= threshold).astype(int), average="binary", zero_division=0
        )
        if f1 > best:
            best, best_threshold = f1, float(threshold)
    return round(best_threshold, 4)


def train_kind(
    kind: str,
    rows: list[dict],
    *,
    feature_order: list[str],
    out_dir: Path,
    seed: int,
    dataset: dict,
) -> dict:
    train, val, test = _split_by_cohort(rows, seed)
    x_train = np.array([_vector(row, feature_order) for row in train])
    y_train = np.array([row["label"] for row in train])
    x_val = np.array([_vector(row, feature_order) for row in val])
    y_val = np.array([row["label"] for row in val])
    x_test = np.array([_vector(row, feature_order) for row in test])
    y_test = np.array([row["label"] for row in test])

    if y_train.sum() == 0 or y_train.sum() == len(y_train):
        raise SystemExit(f"{kind}: training split has a single class; generate more cohorts")

    estimator = make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=4000, class_weight="balanced", random_state=seed),
    )
    model = CalibratedClassifierCV(estimator, method="sigmoid", cv=3)
    model.fit(x_train, y_train)
    if list(model.classes_) != [0, 1]:
        raise SystemExit(f"{kind}: unexpected class order {model.classes_}")

    threshold = _pick_threshold(y_val, model.predict_proba(x_val)[:, 1])
    test_scores = model.predict_proba(x_test)[:, 1]
    metrics = _metrics(y_test, test_scores, threshold)
    metrics["thresholdSource"] = "validation-f1"

    artifact = out_dir / f"{kind}_fusion.joblib"
    joblib.dump(model, artifact)

    metadata = {
        "kind": kind,
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "featureOrder": feature_order,
        "estimator": "CalibratedClassifierCV(StandardScaler+LogisticRegression, sigmoid)",
        "sklearnVersion": sklearn.__version__,
        "numpyVersion": np.__version__,
        "dataset": dataset,
        "splits": {
            "train": len(train),
            "validation": len(val),
            "test": len(test),
            "splitBy": "cohort",
        },
        "threshold": threshold,
        "metrics": metrics,
        "synthetic": True,
        "scoreSemantics": (
            "Calibrated review-priority estimate from synthetic labels. Not a probability "
            "that a candidate committed misconduct."
        ),
    }
    (out_dir / f"{kind}_fusion.meta.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


def _model_card(pair: dict, incident: dict, manifest: dict) -> str:
    def row(metadata: dict, key: str) -> str:
        value = metadata["metrics"].get(key)
        return "n/a" if value is None else f"{value}"

    return f"""# ExamGuard fusion models

Trained {pair['trainedAt']} from {manifest['generatorVersion']} synthetic cohorts.

## What these models do

They convert the rule features (lexical, semantic, rare-pattern, cross-question, timing,
coverage) into a 0-100 **review priority**. The score is a routing signal for human review.
It is not a probability that a candidate committed misconduct, and it must never be presented
as evidence on its own.

## Data

| Kind | Rows | Positives | Positive rate | Cohorts |
| --- | --- | --- | --- | --- |
| pair | {manifest['pair']['rows']} | {manifest['pair']['positives']} | {manifest['pair']['positiveRate']} | {manifest['pair']['cohorts']} |
| incident | {manifest['incident']['rows']} | {manifest['incident']['positives']} | {manifest['incident']['positiveRate']} | {manifest['incident']['cohorts']} |

Splits are made by cohort, never by row, so pairs from one cohort cannot straddle
train and test. Label rules are generated by `app/training/cohorts.py`; the generator is
deterministic given `--seed {manifest['seed']}`.

## Held-out metrics

| Metric | Pair | Incident |
| --- | --- | --- |
| Average precision | {row(pair, 'averagePrecision')} | {row(incident, 'averagePrecision')} |
| ROC AUC | {row(pair, 'rocAuc')} | {row(incident, 'rocAuc')} |
| Brier | {row(pair, 'brier')} | {row(incident, 'brier')} |
| Precision @ threshold | {row(pair, 'precisionAtThreshold')} | {row(incident, 'precisionAtThreshold')} |
| Recall @ threshold | {row(pair, 'recallAtThreshold')} | {row(incident, 'recallAtThreshold')} |
| Precision @ 10% review budget | {row(pair, 'precisionAtBudget')} | {row(incident, 'precisionAtBudget')} |
| Recall @ 10% review budget | {row(pair, 'recallAtBudget')} | {row(incident, 'recallAtBudget')} |

Thresholds: pair {pair['threshold']}, incident {incident['threshold']} (chosen on the
validation split).

## Limitations that matter

1. **Circularity.** Labels come from the same simulator that defines the rule features.
   High metrics show the pipeline is wired correctly; they are not evidence of real-world
   validity.
2. **Text diversity is small.** Cohorts reuse a fixed pool of four questions and seven base
   answers with stylistic variation. A model can exploit wording artefacts that will not
   exist in a real exam.
3. **Class balance is generous.** Roughly a quarter of pairs are positive by construction.
   Real cohorts are far more skewed.
4. **The priority framing is preserved by construction only.** Re-validate calibration on a
   consented pilot before enabling `USE_LEARNED_FUSION` in production.

## Reproduce

```bash
cd ai
python -m app.training.export --out data --pair-cohorts 150 --incident-cohorts 150 --seed {manifest['seed']}
python -m app.training.train --data data --out models --seed {manifest['seed']}
```

On Kaggle, use `kaggle/notebooks/train_fusion.ipynb`; the same two commands run there.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Train fusion models")
    parser.add_argument("--data", type=Path, default=Path("data"))
    parser.add_argument("--out", type=Path, default=Path("models"))
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    manifest = json.loads((args.data / "manifest.json").read_text(encoding="utf-8"))
    args.out.mkdir(parents=True, exist_ok=True)

    pair = train_kind(
        "pair",
        _load_rows(args.data / manifest["pair"]["file"]),
        feature_order=manifest["pair"]["featureOrder"],
        out_dir=args.out,
        seed=args.seed,
        dataset=manifest["pair"],
    )
    incident = train_kind(
        "incident",
        _load_rows(args.data / manifest["incident"]["file"]),
        feature_order=manifest["incident"]["featureOrder"],
        out_dir=args.out,
        seed=args.seed,
        dataset=manifest["incident"],
    )

    (args.out / "MODEL_CARD.md").write_text(
        _model_card(pair, incident, manifest), encoding="utf-8"
    )
    for metadata in (pair, incident):
        print(
            f"{metadata['kind']}: AP={metadata['metrics']['averagePrecision']} "
            f"AUC={metadata['metrics']['rocAuc']} "
            f"P@10%={metadata['metrics']['precisionAtBudget']} "
            f"threshold={metadata['threshold']}"
        )


if __name__ == "__main__":
    main()
