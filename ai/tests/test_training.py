"""The export/train pipeline must use the same feature vectors as inference."""

from __future__ import annotations

import json

import joblib

from app.evaluation.synthetic import build_pair_dataset
from app.features.fusion import PAIR_FEATURE_ORDER, fuse_pair
from app.features.pair_rows import build_pair_rows
from app.services.analyzer import analyze_pairs
from app.training.corpora import export as export_external
from app.training.corpora import load_pairs
from app.training.export import export_dataset
from app.training.train import _split_by_cohort, train_kind


def test_export_matches_inference_scores():
    request, _labels = build_pair_dataset()
    row_set = build_pair_rows(request)
    assert len(row_set.rows) == 45

    response = analyze_pairs(request)
    reported = {
        (finding.candidateA, finding.candidateB): finding.priorityScore
        for finding in response.findings
    }

    compared = 0
    for row in row_set.rows:
        fusion = fuse_pair(
            row.features,
            semantic_available=row.semantic_available,
            completeness_warning=row.coverage_warning,
            coverage_warning=row.coverage_warning,
        )
        key = (row.candidate_a, row.candidate_b)
        if key in reported:
            assert fusion.score == reported[key]
            compared += 1
    assert compared > 0


def test_export_writes_rows_manifest_and_both_classes(tmp_path):
    manifest = export_dataset(
        tmp_path, pair_cohorts=8, incident_cohorts=8, seed=11
    )
    assert manifest["synthetic"] is True
    rows = [
        json.loads(line)
        for line in (tmp_path / "pairs.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert rows
    assert {frozenset(row["features"]) for row in rows} == {frozenset(PAIR_FEATURE_ORDER)}
    assert {row["label"] for row in rows} == {0, 1}
    assert manifest["pair"]["rows"] == len(rows)

    incident_rows = [
        json.loads(line)
        for line in (tmp_path / "incidents.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert incident_rows
    assert {row["label"] for row in incident_rows} == {0, 1}


def test_cohort_split_never_straddles_train_and_test(tmp_path):
    rows = []
    for cohort in range(10):
        rows.append({"cohort": f"c{cohort}", "features": {}, "label": cohort % 2})
    train, val, test = _split_by_cohort(rows, seed=3)
    groups = [set(row["cohort"] for row in part) for part in (train, val, test)]
    assert groups[0].isdisjoint(groups[1])
    assert groups[0].isdisjoint(groups[2])
    assert groups[1].isdisjoint(groups[2])
    assert len(groups[0] | groups[1] | groups[2]) == 10


def test_training_produces_a_loadable_model(tmp_path):
    data_dir = tmp_path / "data"
    model_dir = tmp_path / "models"
    manifest = export_dataset(
        data_dir, pair_cohorts=24, incident_cohorts=24, seed=5
    )
    model_dir.mkdir()
    rows = [
        json.loads(line)
        for line in (data_dir / manifest["pair"]["file"]).read_text(encoding="utf-8").splitlines()
    ]
    metadata = train_kind(
        "pair",
        rows,
        feature_order=manifest["pair"]["featureOrder"],
        out_dir=model_dir,
        seed=5,
        dataset=manifest["pair"],
    )

    artifact = model_dir / "pair_fusion.joblib"
    assert artifact.exists()
    assert (model_dir / "pair_fusion.meta.json").exists()
    assert metadata["splits"]["splitBy"] == "cohort"
    assert 0.0 <= metadata["threshold"] <= 1.0

    model = joblib.load(artifact)
    probability = model.predict_proba([[0.9, 0.0, 0.9, 0.5, 0.8, 0.0]])[0][1]
    assert 0.0 <= probability <= 1.0


def test_external_adapter_rejects_unlicensed_rows(tmp_path):
    corpus = tmp_path / "pairs.jsonl"
    base = {
        "textA": "A write-ahead log records redo records before dirty pages reach disk.",
        "textB": "The WAL stores redo records before dirty pages are written to disk.",
        "cohort": "c1",
    }
    corpus.write_text(
        "\n".join(
            json.dumps(row)
            for row in (
                {**base, "label": 1, "source": "demo", "license": "CC-BY-4.0"},
                {**base, "label": 0, "source": "demo", "license": "all-rights-reserved"},
            )
        )
        + "\n",
        encoding="utf-8",
    )
    pairs, rejected = load_pairs(corpus)
    assert len(pairs) == 1
    assert pairs[0].license == "cc-by-4.0"
    assert len(rejected) == 1
    assert "all-rights-reserved" in rejected[0]


def test_external_adapter_exports_labelled_cohort_rows(tmp_path):
    corpus = tmp_path / "pairs.jsonl"
    texts = [
        "A write-ahead log records redo records before dirty pages reach disk, so recovery replays commits.",
        "The WAL stores redo records before dirty pages are written, so committed work survives a crash.",
        "Manifest V3 runs background work in an event-driven service worker that the browser can stop.",
        "An epoch change during a long read can let a stale reader write old values into the cache.",
    ]
    rows = [
        {"textA": texts[0], "textB": texts[1], "label": 1, "cohort": "c1",
         "source": "demo", "license": "research-use"},
        {"textA": texts[0], "textB": texts[2], "label": 0, "cohort": "c1",
         "source": "demo", "license": "research-use"},
        {"textA": texts[0], "textB": texts[3], "label": 0, "cohort": "c1",
         "source": "demo", "license": "research-use"},
        {"textA": texts[2], "textB": texts[3], "label": 0, "cohort": "c1",
         "source": "demo", "license": "research-use"},
    ]
    corpus.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")

    pairs, rejected = load_pairs(corpus)
    assert not rejected

    manifest = export_external(pairs, tmp_path / "out")
    assert manifest["synthetic"] is False
    assert manifest["timingAvailable"] is False
    exported = [
        json.loads(line)
        for line in (tmp_path / "out" / "pairs.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert exported
    assert {row["label"] for row in exported} == {0, 1}
    assert all(row["timingAvailable"] is False for row in exported)
    assert all(set(row["features"]) == set(PAIR_FEATURE_ORDER) for row in exported)
