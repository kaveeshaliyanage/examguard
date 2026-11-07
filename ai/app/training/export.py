"""Export training rows from synthetic cohorts.

Rows carry the exact feature vector that inference builds. Run:

    python -m app.training.export --out data --pair-cohorts 150 --incident-cohorts 150
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from datetime import datetime, timezone
from pathlib import Path

from ..features.activity import compute_incident
from ..features.fusion import INCIDENT_FEATURE_ORDER, PAIR_FEATURE_ORDER, pair_weights
from ..features.pair_rows import build_pair_rows
from .cohorts import generate_incident_cohort, generate_pair_cohort

GENERATOR_VERSION = "synthetic-train-1.0"


def _write_jsonl(path: Path, rows: list[dict]) -> str:
    digest = hashlib.sha256()
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            line = json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
            digest.update(line.encode("utf-8"))
            handle.write(line)
    return digest.hexdigest()


def _pair_rows(count: int, seed: int) -> list[dict]:
    rows: list[dict] = []
    for index in range(count):
        rng = random.Random(f"{seed}-pair-{index}")
        request, labels = generate_pair_cohort(rng, index)
        row_set = build_pair_rows(request)
        cohort = f"pair-{index:04d}"
        for row in row_set.rows:
            label = labels.get((row.candidate_a, row.candidate_b), 0)
            rows.append(
                {
                    "cohort": cohort,
                    "kind": "pair",
                    "candidateA": row.candidate_a,
                    "candidateB": row.candidate_b,
                    "label": label,
                    "features": {
                        name: round(row.features.get(name, 0.0), 6)
                        for name in PAIR_FEATURE_ORDER
                    },
                    "semanticAvailable": row.semantic_available,
                    "weights": pair_weights(row.semantic_available),
                }
            )
    return rows


def _incident_rows(count: int, seed: int) -> list[dict]:
    rows: list[dict] = []
    for index in range(count):
        rng = random.Random(f"{seed}-incident-{index}")
        request, labels = generate_incident_cohort(rng, index)
        cohort = f"incident-{index:04d}"
        for candidate in request.candidates:
            features = compute_incident(
                candidate,
                request.rules,
                timing_window_seconds=request.config.timingWindowSeconds,
                min_coverage_percent=request.config.minCoveragePercent,
            )
            if features is None:
                continue
            rows.append(
                {
                    "cohort": cohort,
                    "kind": "incident",
                    "candidate": candidate.candidateCode,
                    "label": labels.get(candidate.candidateCode, 0),
                    "features": {
                        name: round(features.featureValues.get(name, 0.0), 6)
                        for name in INCIDENT_FEATURE_ORDER
                    },
                }
            )
    return rows


def export_dataset(
    out_dir: Path,
    *,
    pair_cohorts: int = 150,
    incident_cohorts: int = 150,
    seed: int = 7,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    pair_rows = _pair_rows(pair_cohorts, seed)
    incident_rows = _incident_rows(incident_cohorts, seed)

    pair_path = out_dir / "pairs.jsonl"
    incident_path = out_dir / "incidents.jsonl"
    pair_hash = _write_jsonl(pair_path, pair_rows)
    incident_hash = _write_jsonl(incident_path, incident_rows)

    def summary(rows: list[dict], digest: str, cohorts: int) -> dict:
        positives = sum(row["label"] for row in rows)
        return {
            "rows": len(rows),
            "positives": positives,
            "positiveRate": round(positives / len(rows), 4) if rows else 0.0,
            "cohorts": cohorts,
            "sha256": digest,
        }

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generatorVersion": GENERATOR_VERSION,
        "seed": seed,
        "synthetic": True,
        "warning": (
            "Labels describe the synthetic simulator. Models fitted on them learn the simulator, "
            "not real academic behaviour. Re-validate on consented pilot data before production."
        ),
        "pair": {
            "featureOrder": PAIR_FEATURE_ORDER,
            "file": pair_path.name,
            **summary(pair_rows, pair_hash, pair_cohorts),
        },
        "incident": {
            "featureOrder": INCIDENT_FEATURE_ORDER,
            "file": incident_path.name,
            **summary(incident_rows, incident_hash, incident_cohorts),
        },
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Export synthetic training rows")
    parser.add_argument("--out", type=Path, default=Path("data"))
    parser.add_argument("--pair-cohorts", type=int, default=150)
    parser.add_argument("--incident-cohorts", type=int, default=150)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    manifest = export_dataset(
        args.out,
        pair_cohorts=args.pair_cohorts,
        incident_cohorts=args.incident_cohorts,
        seed=args.seed,
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
