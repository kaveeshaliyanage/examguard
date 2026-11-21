"""Authorship export determinism, leakage guards, external licences and evaluation gates."""

from __future__ import annotations

import json

import joblib
import pytest

from app.authorship.features import AUTHORSHIP_FEATURE_ORDER
from app.training.authorship_corpora import (
    ExternalAuthorshipRow,
    author_grouped_split,
    export_external,
    load_authorship_rows,
)
from app.training.authorship_eval import (
    auroc,
    enforce_gates,
    evaluate_rows,
    expected_calibration_error,
    gate_metrics,
    tpr_at_fpr,
)
from app.training.authorship_export import export_authorship_dataset
from app.training.authorship_train import _model_card, split_by_author, train_authorship


def test_export_is_deterministic_and_complete(tmp_path):
    first = export_authorship_dataset(tmp_path / "a", cohorts=12, seed=5)
    second = export_authorship_dataset(tmp_path / "b", cohorts=12, seed=5)

    assert first["rows"]["sha256"] == second["rows"]["sha256"]
    assert first["manifestSha256"] == second["manifestSha256"]
    assert {
        key: value for key, value in first.items() if key != "generatedAt"
    } == {
        key: value for key, value in second.items() if key != "generatedAt"
    }
    assert first["synthetic"] is True
    assert first["rows"]["rows"] == (
        first["rows"]["classBalance"]["human"] + first["rows"]["classBalance"]["machine"]
    )
    assert set(first["rows"]["classBalance"]) == {"human", "machine"}
    assert first["rows"]["featureOrder"] == AUTHORSHIP_FEATURE_ORDER

    rows = [
        json.loads(line)
        for line in (tmp_path / "a" / "authorship.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert {row["label"] for row in rows} == {0, 1}
    assert all(set(row["features"]) == set(AUTHORSHIP_FEATURE_ORDER) for row in rows)


def test_export_differs_with_seed(tmp_path):
    first = export_authorship_dataset(tmp_path / "a", cohorts=10, seed=5)
    second = export_authorship_dataset(tmp_path / "b", cohorts=10, seed=6)
    assert first["rows"]["sha256"] != second["rows"]["sha256"]


def test_training_splits_group_by_author():
    rows = [
        {"cohort": f"c{index}", "authorId": f"c{index}", "features": {}, "label": index % 2}
        for index in range(12)
    ]
    train, val, test = split_by_author(rows, seed=3)
    groups = [set(row["authorId"] for row in part) for part in (train, val, test)]
    assert groups[0].isdisjoint(groups[1])
    assert groups[0].isdisjoint(groups[2])
    assert groups[1].isdisjoint(groups[2])
    assert len(groups[0] | groups[1] | groups[2]) == 12


def test_external_loader_rejects_missing_licence_or_author(tmp_path):
    corpus = tmp_path / "authorship.jsonl"
    base = {
        "text": "A careful answer. " * 20,
        "label": 0,
        "source": "demo",
    }
    corpus.write_text(
        "\n".join(
            json.dumps(row)
            for row in (
                {**base, "authorId": "u1", "license": "CC-BY-4.0"},
                {**base, "authorId": "u1"},
                {**base, "license": "CC-BY-4.0"},
                {**base, "authorId": "u2", "license": "all-rights-reserved"},
                {**base, "authorId": "u3", "license": "CC0-1.0", "text": "short"},
            )
        )
        + "\n",
        encoding="utf-8",
    )
    rows, rejected = load_authorship_rows(corpus)
    assert len(rows) == 1
    assert rows[0].license == "cc-by-4.0"
    assert len(rejected) == 4
    assert any("missing licence" in message for message in rejected)
    assert any("missing author id" in message for message in rejected)
    assert any("not allowed" in message for message in rejected)


def test_external_rows_split_by_author_without_leakage(tmp_path):
    rows = [
        ExternalAuthorshipRow(
            text="A long enough answer. " * 20,
            label=index % 2,
            author_id=f"author-{index % 4}",
            source="demo",
            license="research-use",
        )
        for index in range(12)
    ]
    train, val, test = author_grouped_split(rows, seed=2)
    groups = [
        {row.author_id for row in part} for part in (train, val, test)
    ]
    assert groups[0].isdisjoint(groups[1])
    assert groups[0].isdisjoint(groups[2])
    assert groups[1].isdisjoint(groups[2])
    assert groups[0] | groups[1] | groups[2] == {f"author-{i}" for i in range(4)}

    manifest = export_external(rows, tmp_path / "out")
    assert manifest["synthetic"] is False
    assert manifest["rows"]["authors"] == 4


def test_metric_helpers_have_known_values():
    labels = [0, 0, 1, 1]
    assert auroc(labels, [0.1, 0.2, 0.8, 0.9]) == 1.0
    assert auroc(labels, [0.9, 0.8, 0.2, 0.1]) == 0.0
    assert tpr_at_fpr(labels, [0.1, 0.2, 0.8, 0.9]) == 1.0
    assert expected_calibration_error([0, 1], [0.0, 1.0]) == 0.0


def test_evaluation_gate_fails_below_thresholds():
    failing = {"auroc": 0.79, "tprAt5Fpr": 0.54, "ece": 0.051}
    failures = gate_metrics(failing)
    assert len(failures) == 3
    with pytest.raises(SystemExit):
        enforce_gates(failing)

    passing = {"auroc": 0.80, "tprAt5Fpr": 0.55, "ece": 0.05}
    assert gate_metrics(passing) == []
    enforce_gates(passing)


def test_evaluate_rows_on_rules_baseline():
    import random

    from app.authorship.classifier import rules_probability
    from app.authorship.features import extract_features
    from app.training.authorship_cohorts import generate_authorship_case

    rows = []
    for index in range(10):
        request, labels = generate_authorship_case(
            random.Random(f"eval-{index}"), index
        )
        candidate = request.candidates[0]
        for answer in candidate.answers:
            rows.append(
                {
                    "label": labels[(candidate.candidateCode, answer.questionId)],
                    "features": extract_features(answer.text, answer.revisions),
                }
            )
    metrics = evaluate_rows(rows, rules_probability)
    assert 0.0 <= metrics["auroc"] <= 1.0
    assert 0.0 <= metrics["tprAt5Fpr"] <= 1.0
    assert 0.0 <= metrics["ece"] <= 1.0


def test_training_produces_loadable_artifacts_and_model_card(tmp_path):
    data_dir = tmp_path / "data"
    model_dir = tmp_path / "models"
    manifest = export_authorship_dataset(data_dir, cohorts=24, seed=5)
    rows = [
        json.loads(line)
        for line in (data_dir / "authorship.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    metadata = train_authorship(
        rows,
        feature_order=manifest["rows"]["featureOrder"],
        out_dir=model_dir,
        seed=5,
        dataset=manifest["rows"],
    )

    artifact = model_dir / "authorship.joblib"
    assert artifact.exists()
    assert (model_dir / "authorship.meta.json").exists()
    assert metadata["featureOrder"] == AUTHORSHIP_FEATURE_ORDER
    assert metadata["scoreCap"] == 54.0
    assert metadata["bandCeiling"] == "MEDIUM"
    assert metadata["splits"]["splitBy"] == "author/cohort"

    model = joblib.load(artifact)
    vector = [0.0] * len(AUTHORSHIP_FEATURE_ORDER)
    probability = model.predict_proba([vector])[0][1]
    assert 0.0 <= probability <= 1.0

    card = _model_card(metadata, manifest)
    assert "synthetic" in card.lower()
    assert "does **not** detect copied work" in card.lower()
    assert "54/100" in card
