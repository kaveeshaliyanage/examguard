"""Export authorship training rows from the synthetic generator.

    python -m app.training.authorship_export --out data-authorship --cohorts 200 --seed 7

Rows carry the exact feature vector that inference builds. The manifest records the seed,
counts, class balance and a SHA-256 of the rows, plus a hash of the manifest body so a rerun
with the same seed can be compared byte for byte. ``generatedAt`` is the only volatile field.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from datetime import datetime, timezone
from pathlib import Path

from ..authorship.features import AUTHORSHIP_FEATURE_ORDER, extract_features
from ..schemas import AuthorshipConfig
from .authorship_cohorts import generate_authorship_case

GENERATOR_VERSION = "synthetic-authorship-1.0"
MIN_ANSWER_CHARS = AuthorshipConfig().minAnswerChars


def write_jsonl(path: Path, rows: list[dict]) -> str:
    digest = hashlib.sha256()
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            line = json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
            digest.update(line.encode("utf-8"))
            handle.write(line)
    return digest.hexdigest()


def build_authorship_rows(count: int, seed: int) -> tuple[list[dict], dict[str, int]]:
    rows: list[dict] = []
    balance: dict[str, int] = {"human": 0, "machine": 0}
    for index in range(count):
        rng = random.Random(f"{seed}-authorship-{index}")
        request, labels = generate_authorship_case(rng, index)
        for candidate in request.candidates:
            for answer in candidate.answers:
                # Match inference: answers below the configured minimum are never scored, so
                # they must not enter training either.
                if len(answer.text.strip()) < MIN_ANSWER_CHARS:
                    continue
                key = (candidate.candidateCode, answer.questionId)
                label = labels[key]
                features = extract_features(answer.text, answer.revisions)
                balance["machine" if label == 1 else "human"] += 1
                rows.append(
                    {
                        "cohort": candidate.candidateCode,
                        "authorId": candidate.candidateCode,
                        "candidate": candidate.candidateCode,
                        "questionId": answer.questionId,
                        "label": label,
                        "source": "synthetic",
                        "features": {
                            name: round(features[name], 6)
                            for name in AUTHORSHIP_FEATURE_ORDER
                        },
                    }
                )
    return rows, balance


def export_authorship_dataset(
    out_dir: Path,
    *,
    cohorts: int = 200,
    seed: int = 7,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    rows, balance = build_authorship_rows(cohorts, seed)

    path = out_dir / "authorship.jsonl"
    rows_hash = write_jsonl(path, rows)
    cohorts_seen = len({row["cohort"] for row in rows})
    positives = sum(row["label"] for row in rows)

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generatorVersion": GENERATOR_VERSION,
        "seed": seed,
        "synthetic": True,
        "warning": (
            "Labels describe the synthetic simulator, not real students. The classifier "
            "detects machine-like prose, not copied work. Re-validate on a licensed corpus "
            "or a consented pilot before production use."
        ),
        "rows": {
            "featureOrder": AUTHORSHIP_FEATURE_ORDER,
            "file": path.name,
            "rows": len(rows),
            "positives": positives,
            "positiveRate": round(positives / len(rows), 4) if rows else 0.0,
            "classBalance": balance,
            "cohorts": cohorts_seen,
            "sha256": rows_hash,
        },
    }
    body = {
        key: value for key, value in manifest.items() if key not in {"generatedAt"}
    }
    manifest["manifestSha256"] = hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Export synthetic authorship rows")
    parser.add_argument("--out", type=Path, default=Path("data-authorship"))
    parser.add_argument("--cohorts", type=int, default=200)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    manifest = export_authorship_dataset(
        args.out, cohorts=args.cohorts, seed=args.seed
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
