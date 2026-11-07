"""Adapter scaffolding for externally labelled text-pair corpora.

The synthetic generator cannot support a validity claim. Real pair evidence has to come from a
corpus with documented provenance and a licence that permits this use. This module only loads,
validates and maps such a corpus into the same feature rows the simulator produces.

Expected input: JSONL, one pair per line.

    {"textA": "...", "textB": "...", "label": 1, "cohort": "pan-2014-01",
     "source": "PAN-PC-11", "license": "research-use"}

`cohort` groups texts that share an exam cohort; a cohort needs at least four distinct texts for
the cohort-relative features (lexical excess, rare-term document frequency) to mean anything.

Candidate corpora, and the checks to perform before use:

- Clough & Stevenson (2011) short-answer plagiarism corpus: request access, confirm the research
  licence, strip identifiers, and keep the original train/test split.
- PAN-PC-11/12 external plagiarism: obfuscated cases map to the "paraphrase" label; licence terms
  vary by year, so record the exact distribution you obtained.
- SemEval-2013 Task 7 / PAN paraphrase corpora: use the official train/test split and cite it.
- OULAD clickstreams (Open University): CC-BY 4.0, but it has no misconduct labels; it can only
  validate the activity/coverage path, never the pair classifier.
- Consented pilot data: the only source that can support a production claim.

Nothing here downloads a corpus. Licence compliance is the operator's responsibility; this loader
refuses entries whose `license` is not on the allowed list so an unlicensed dataset cannot slip
into training silently.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..features.pair_rows import build_pair_rows
from ..features.fusion import PAIR_FEATURE_ORDER
from ..schemas import Answer, PairAnalysisRequest, PairCandidate, PairConfig, Question, Revision

ALLOWED_LICENSES = {
    "cc0-1.0",
    "cc-by-4.0",
    "cc-by-sa-4.0",
    "mit",
    "apache-2.0",
    "research-use",
    "consented-pilot",
}

MIN_COHORT_TEXTS = 4


@dataclass
class ExternalPair:
    text_a: str
    text_b: str
    label: int
    cohort: str
    source: str
    license: str


def load_pairs(path: Path) -> tuple[list[ExternalPair], list[str]]:
    pairs: list[ExternalPair] = []
    rejected: list[str] = []
    with path.open("r", encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
                licence = str(raw["license"]).strip().lower()
                if licence not in ALLOWED_LICENSES:
                    rejected.append(f"line {number}: licence {raw['license']!r} is not allowed")
                    continue
                if int(raw["label"]) not in (0, 1):
                    rejected.append(f"line {number}: label must be 0 or 1")
                    continue
                text_a, text_b = str(raw["textA"]).strip(), str(raw["textB"]).strip()
                if len(text_a) < 20 or len(text_b) < 20:
                    rejected.append(f"line {number}: text shorter than 20 characters")
                    continue
                pairs.append(
                    ExternalPair(
                        text_a=text_a,
                        text_b=text_b,
                        label=int(raw["label"]),
                        cohort=str(raw["cohort"]),
                        source=str(raw["source"]),
                        license=licence,
                    )
                )
            except (KeyError, TypeError, ValueError) as error:
                rejected.append(f"line {number}: {error}")
    return pairs, rejected


def _cohort_request(pairs: list[ExternalPair], cohort: str, exam_id: int) -> tuple[PairAnalysisRequest, dict[tuple[str, str], int]]:
    codes: list[str] = []
    texts: list[str] = []
    labels: dict[tuple[str, str], int] = {}

    def code_for(text: str) -> str:
        if text not in texts:
            texts.append(text)
            codes.append(f"T{len(texts):02d}")
        return codes[texts.index(text)]

    for pair in pairs:
        a = code_for(pair.text_a)
        b = code_for(pair.text_b)
        key = (a, b) if a < b else (b, a)
        labels[key] = pair.label

    request = PairAnalysisRequest(
        examId=exam_id,
        modelVersion=f"external:{pairs[0].source}",
        questions=[Question(id=1, prompt="External corpus item")],
        candidates=[
            PairCandidate(
                candidateCode=codes[index],
                answers=[
                    # Repeated into a second revision so timing profiles exist; the timestamps are
                    # synthetic and timing is deliberately uninformative for external corpora.
                    # Downstream training must treat `timing` as unavailable for these rows.
                    _answer(text)
                ],
            )
            for index, text in enumerate(texts)
        ],
        config=PairConfig(minAnswerChars=20, similarityThreshold=0.5, rareDfMax=3, timingWindowSeconds=0),
    )
    return request, labels


def _answer(text: str) -> Answer:
    saved = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return Answer(
        questionId=1,
        text=text,
        revisions=[
            Revision(revisionNo=1, text=text, savedAt=saved),
            Revision(revisionNo=2, text=text, savedAt=saved + timedelta(hours=1)),
        ],
    )


def export(pairs: list[ExternalPair], out_dir: Path) -> dict:
    by_cohort: dict[str, list[ExternalPair]] = {}
    for pair in pairs:
        by_cohort.setdefault(pair.cohort, []).append(pair)

    rows: list[dict] = []
    skipped: dict[str, str] = {}
    for index, (cohort, items) in enumerate(sorted(by_cohort.items())):
        request, labels = _cohort_request(items, cohort, 5000 + index)
        if len(request.candidates) < MIN_COHORT_TEXTS:
            skipped[cohort] = f"only {len(request.candidates)} distinct texts"
            continue
        for row in build_pair_rows(request).rows:
            key = (row.candidate_a, row.candidate_b)
            if key not in labels:
                continue
            rows.append(
                {
                    "cohort": cohort,
                    "kind": "pair",
                    "candidateA": row.candidate_a,
                    "candidateB": row.candidate_b,
                    "label": labels[key],
                    "features": {
                        name: round(row.features.get(name, 0.0), 6)
                        for name in PAIR_FEATURE_ORDER
                    },
                    "semanticAvailable": row.semantic_available,
                    "external": True,
                    "timingAvailable": False,
                    "source": items[0].source,
                    "license": items[0].license,
                }
            )

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "pairs.jsonl"
    digest = hashlib.sha256()
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            line = json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
            digest.update(line.encode("utf-8"))
            handle.write(line)

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generatorVersion": "external-adapter-1.0",
        "synthetic": False,
        "timingAvailable": False,
        "warning": (
            "External corpora carry their own provenance and licence. Record both, keep the "
            "official split, and never mix these rows with synthetic rows without tracking "
            "which is which."
        ),
        "pair": {
            "featureOrder": PAIR_FEATURE_ORDER,
            "file": path.name,
            "rows": len(rows),
            "positives": sum(row["label"] for row in rows),
            "positiveRate": round(
                sum(row["label"] for row in rows) / len(rows), 4
            ) if rows else 0.0,
            "cohorts": len({row["cohort"] for row in rows}),
            "sha256": digest.hexdigest(),
        },
        "skippedCohorts": skipped,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Map a licensed pair corpus to feature rows")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("data-external"))
    args = parser.parse_args()

    pairs, rejected = load_pairs(args.input)
    for message in rejected:
        print(f"rejected {message}")
    manifest = export(pairs, args.out)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
