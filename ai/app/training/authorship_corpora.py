"""Adapter scaffolding for externally labelled authorship corpora.

The synthetic generator cannot support a validity claim. Real authorship evidence has to come
from a corpus with documented provenance, a licence that permits this use, and author ids so
splits can be grouped by author. This module loads, validates and maps such a corpus into the
same feature rows the synthetic generator produces. Nothing here downloads a corpus.

Expected input: JSONL, one text per line.

    {"text": "...", "label": 1 or 0, "authorId": "u-1042", "source": "HC3",
     "license": "cc-by-sa-4.0"}

Rows without a licence or without an author id are rejected: an unlicensed dataset must not
slip into training, and splits must group by author to prevent the same person appearing in
train and test.

Candidate corpora and the checks to perform before use:

- HC3 (Hello-SimpleAI): human/ChatGPT answer pairs across domains. Licence is CC-BY-SA-4.0;
  keep the source field and share adaptations under the same terms.
- DAIGT v2 (Kaggle "LLM - Detect AI Generated Text"): mixed generators and prompt families.
  Confirm the competition data licence before exporting anything derived from it.
- RAID (Dugan et al., 2024): machine-generated text with adversarial attacks across models,
  domains and decoding strategies. Code is MIT; verify the data licence separately.
- M4 (Wang et al., 2024): multi-source, multi-model, multi-language. Repository licence does
  not override the licence of each underlying source text; record it per row.
- Persuade 2.0: student argumentative essays. Access is gated and research-use only; never
  redistribute the raw text, and treat author ids as pseudonymous identifiers.
- ELLIPSE: English language learner essays. Research-use; confirm consent language covers
  authorship-style analysis before mapping rows.

Rows tagged ``consented-pilot`` are the only ones that can support a production claim.
Licence compliance remains the operator's responsibility.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from ..authorship.features import AUTHORSHIP_FEATURE_ORDER, extract_features

ALLOWED_LICENSES = {
    "cc0",
    "cc0-1.0",
    "cc-by",
    "cc-by-4.0",
    "cc-by-sa",
    "cc-by-sa-4.0",
    "mit",
    "apache-2.0",
    "research-use",
    "consented-pilot",
}

SPLIT_FRACTIONS = (0.7, 0.15, 0.15)
MIN_TEXT_CHARS = 200


@dataclass
class ExternalAuthorshipRow:
    text: str
    label: int
    author_id: str
    source: str
    license: str

    @property
    def cohort(self) -> str:
        # One author is one cohort: splits group by author, never by row.
        return f"{self.source}:{self.author_id}"


def _normalize_license(raw: object) -> str:
    return str(raw).strip().lower()


def load_authorship_rows(
    path: Path,
) -> tuple[list[ExternalAuthorshipRow], list[str]]:
    rows: list[ExternalAuthorshipRow] = []
    rejected: list[str] = []
    with path.open("r", encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as error:
                rejected.append(f"line {number}: {error}")
                continue
            try:
                if "license" not in raw or not str(raw["license"]).strip():
                    rejected.append(f"line {number}: missing licence")
                    continue
                licence = _normalize_license(raw["license"])
                if licence not in ALLOWED_LICENSES:
                    rejected.append(
                        f"line {number}: licence {raw['license']!r} is not allowed"
                    )
                    continue
                if "authorId" not in raw or not str(raw["authorId"]).strip():
                    rejected.append(f"line {number}: missing author id")
                    continue
                if "text" not in raw:
                    rejected.append(f"line {number}: missing text")
                    continue
                text = str(raw["text"]).strip()
                if len(text) < MIN_TEXT_CHARS:
                    rejected.append(
                        f"line {number}: text shorter than {MIN_TEXT_CHARS} characters"
                    )
                    continue
                label = int(raw["label"])
                if label not in (0, 1):
                    rejected.append(f"line {number}: label must be 0 or 1")
                    continue
                rows.append(
                    ExternalAuthorshipRow(
                        text=text,
                        label=label,
                        author_id=str(raw["authorId"]).strip(),
                        source=str(raw.get("source", "unknown")).strip() or "unknown",
                        license=licence,
                    )
                )
            except (KeyError, TypeError, ValueError) as error:
                rejected.append(f"line {number}: {error}")
    return rows, rejected


def author_grouped_split(
    rows: list[ExternalAuthorshipRow],
    seed: int,
    fractions: tuple[float, float, float] = SPLIT_FRACTIONS,
) -> tuple[
    list[ExternalAuthorshipRow],
    list[ExternalAuthorshipRow],
    list[ExternalAuthorshipRow],
]:
    """Split by author so no author's texts straddle train, validation and test."""
    authors = sorted({row.cohort for row in rows})
    random.Random(f"{seed}-authorship-split").shuffle(authors)
    n = len(authors)
    if n == 0:
        return [], [], []
    train_end = max(1, int(n * fractions[0]))
    val_end = max(train_end, min(n, int(n * (fractions[0] + fractions[1]))))
    train_authors = set(authors[:train_end])
    val_authors = set(authors[train_end:val_end])
    test_authors = set(authors[val_end:])
    train = [row for row in rows if row.cohort in train_authors]
    val = [row for row in rows if row.cohort in val_authors]
    test = [row for row in rows if row.cohort in test_authors]
    return train, val, test


def _text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def export_external(rows: list[ExternalAuthorshipRow], out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    exported = [
        {
            "cohort": row.cohort,
            "authorId": row.author_id,
            "label": row.label,
            "source": row.source,
            "license": row.license,
            "textSha256": _text_hash(row.text),
            "external": True,
            "features": {
                name: round(value, 6)
                for name, value in extract_features(row.text).items()
            },
        }
        for row in rows
    ]

    path = out_dir / "authorship-external.jsonl"
    digest = hashlib.sha256()
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in exported:
            line = json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
            digest.update(line.encode("utf-8"))
            handle.write(line)

    sources: dict[str, int] = {}
    licences: dict[str, int] = {}
    for row in exported:
        sources[row["source"]] = sources.get(row["source"], 0) + 1
        licences[row["license"]] = licences.get(row["license"], 0) + 1

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generatorVersion": "external-authorship-adapter-1.0",
        "synthetic": False,
        "allowedLicenses": sorted(ALLOWED_LICENSES),
        "warning": (
            "External corpora carry their own provenance and licence. Record both, keep the "
            "official split when one exists, group splits by author, and never present a "
            "model trained here as validated for production without a consented pilot."
        ),
        "rows": {
            "featureOrder": AUTHORSHIP_FEATURE_ORDER,
            "file": path.name,
            "rows": len(exported),
            "positives": sum(row["label"] for row in exported),
            "authors": len({row["authorId"] for row in exported}),
            "sources": sources,
            "licenses": licences,
            "sha256": digest.hexdigest(),
        },
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Map a licensed authorship corpus to feature rows"
    )
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("data-authorship-external"))
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--check-split", action="store_true")
    args = parser.parse_args()

    rows, rejected = load_authorship_rows(args.input)
    for message in rejected:
        print(f"rejected {message}")
    if args.check_split:
        train, val, test = author_grouped_split(rows, args.seed)
        print(
            json.dumps(
                {"train": len(train), "validation": len(val), "test": len(test)},
                indent=2,
            )
        )
    manifest = export_external(rows, args.out)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
