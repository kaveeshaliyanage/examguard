"""Authorship schema, feature, scoring, cap and endpoint contracts (offline)."""

from __future__ import annotations

import math
import random

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.authorship.classifier import (
    AUTHORSHIP_SCORE_CAP,
    authorship_band,
    score_features,
)
from app.authorship.features import (
    AUTHORSHIP_FEATURE_ORDER,
    extract_features,
    feature_order_matches,
)
from app.main import app
from app.schemas import (
    AuthorshipAnswer,
    AuthorshipCandidate,
    AuthorshipConfig,
    AuthorshipRequest,
    AuthorshipRevision,
)
from app.services.authorship_analysis import analyze_authorship
from app.training.authorship_cohorts import generate_authorship_case

client = TestClient(app)


def _machine_case(seed: str = "authorship-test") -> AuthorshipRequest:
    for index in range(40):
        request, labels = generate_authorship_case(random.Random(f"{seed}-{index}"), index)
        code = request.candidates[0].candidateCode
        if labels[(code, 1)] == 1:
            return request
    raise AssertionError("generator produced no machine-like case")


def _request_payload(request: AuthorshipRequest) -> dict:
    return request.model_dump(mode="json")


def test_schema_rejects_unknown_fields():
    payload = _request_payload(_machine_case())
    payload["candidates"][0]["events"] = []
    with pytest.raises(ValidationError):
        AuthorshipRequest.model_validate(payload)

    payload = _request_payload(_machine_case())
    payload["candidates"][0]["answers"][0]["surprise"] = 1
    with pytest.raises(ValidationError):
        AuthorshipRequest.model_validate(payload)


def test_schema_rejects_duplicate_candidates():
    candidate = AuthorshipCandidate(
        candidateCode="C01",
        answers=[AuthorshipAnswer(questionId=1, text="x" * 200)],
    )
    with pytest.raises(ValidationError, match="repeats candidate code"):
        AuthorshipRequest(examId=1, candidates=[candidate, candidate])


def test_features_are_deterministic_and_ordered():
    request = _machine_case()
    answer = request.candidates[0].answers[0]
    first = extract_features(answer.text, answer.revisions)
    second = extract_features(answer.text, answer.revisions)
    assert first == second
    assert list(first) == AUTHORSHIP_FEATURE_ORDER
    assert feature_order_matches(AUTHORSHIP_FEATURE_ORDER)
    assert not feature_order_matches(AUTHORSHIP_FEATURE_ORDER[::-1])


def test_features_handle_empty_and_short_text():
    for text in ("", "   "):
        features = extract_features(text)
        assert list(features) == AUTHORSHIP_FEATURE_ORDER
        assert all(math.isfinite(value) for value in features.values())
        assert features["revisionCount"] == 0
        assert features["typeTokenRatio"] == 0.0

    short = extract_features("Hi.")
    assert list(short) == AUTHORSHIP_FEATURE_ORDER
    assert all(math.isfinite(value) for value in short.values())
    assert short["revisionCount"] == 0


def test_revision_dynamics_features():
    revisions = [
        AuthorshipRevision(
            revisionNo=1,
            text="A short draft about caching and invalidation.",
            savedAt="2026-03-01T09:00:00Z",
        ),
        AuthorshipRevision(
            revisionNo=2,
            text=(
                "A short draft about caching and invalidation, now with the failure mode "
                "spelled out and a mitigation that we can actually deploy on Friday."
            ),
            savedAt="2026-03-01T09:05:00Z",
        ),
        AuthorshipRevision(
            revisionNo=3,
            text=(
                "A short draft about caching and invalidation, now with the failure mode "
                "spelled out and a mitigation that we can actually deploy on Friday. The "
                "remaining risk is a stale read during deploy, which we accept for now."
            ),
            savedAt="2026-03-01T09:10:00Z",
        ),
    ]
    final = revisions[-1].text
    features = extract_features(final, revisions)
    assert features["revisionCount"] == 3
    assert features["meanWordsAddedPerRevision"] > 0
    assert features["finalFirstWordRatio"] > 1

    without_revisions = extract_features(final)
    assert without_revisions["revisionCount"] == 0
    assert without_revisions["meanWordsAddedPerRevision"] == 0
    assert without_revisions["finalFirstWordRatio"] == 0


def test_score_cap_holds_when_learned_model_is_over_confident(monkeypatch):
    monkeypatch.setattr("app.authorship.classifier._learned", lambda vector: 0.99)
    request = _machine_case()
    answer = request.candidates[0].answers[0]
    result = score_features(extract_features(answer.text, answer.revisions))

    assert result.learned is True
    assert result.capped is True
    assert result.score <= AUTHORSHIP_SCORE_CAP
    assert result.probability <= AUTHORSHIP_SCORE_CAP / 100.0
    assert result.band in {"LOW", "MEDIUM"}
    assert result.band != "HIGH" and result.band != "CRITICAL"


def test_bands_and_extreme_features_never_reach_high():
    extreme = {
        "sentenceLengthMean": 15.0,
        "sentenceLengthVariance": 0.0,
        "burstiness": -1.0,
        "typeTokenRatio": 0.4,
        "hapaxRatio": 0.3,
        "commaRate": 0.1,
        "semicolonRate": 0.0,
        "dashRate": 0.0,
        "parenthesisRate": 0.0,
        "contractionRate": 0.0,
        "averageWordLength": 6.0,
        "repeatedBigramRate": 0.5,
        "paragraphLengthVariance": 0.0,
        "revisionCount": 2.0,
        "meanWordsAddedPerRevision": 0.0,
        "finalFirstWordRatio": 1.0,
    }
    extreme.update({name: 0.1 for name in AUTHORSHIP_FEATURE_ORDER if name.startswith("functionWord_")})
    result = score_features(extreme)
    assert result.score <= AUTHORSHIP_SCORE_CAP
    assert result.band == "MEDIUM"
    assert authorship_band(29.9) == "LOW"
    assert authorship_band(30.0) == "MEDIUM"
    assert authorship_band(100.0) == "MEDIUM"


def test_short_answers_are_skipped_and_findings_are_capped():
    long_answer = AuthorshipAnswer(
        questionId=1,
        text=_machine_case().candidates[0].answers[0].text,
    )
    short_answer = AuthorshipAnswer(questionId=2, text="Too short to score.")
    request = AuthorshipRequest(
        examId=9,
        candidates=[
            AuthorshipCandidate(
                candidateCode="C01",
                answers=[short_answer, long_answer, long_answer.model_copy(update={"questionId": 3})],
            )
        ],
        config=AuthorshipConfig(minAnswerChars=200, maxFindings=1),
    )
    response = analyze_authorship(request)
    assert response.stats["skippedShort"] == 1
    assert response.stats["answersEvaluated"] == 2
    assert len(response.findings) == 1
    assert response.findings[0].priorityBand in {"LOW", "MEDIUM"}
    assert response.findings[0].priorityScore <= AUTHORSHIP_SCORE_CAP


def test_empty_request_is_safe():
    response = analyze_authorship(AuthorshipRequest(examId=1, candidates=[]))
    assert response.findings == []
    assert response.stats["answersEvaluated"] == 0
    assert response.stats["skippedShort"] == 0


def test_authorship_endpoint_contract():
    payload = _request_payload(_machine_case())
    response = client.post("/analyze/authorship", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["stats"]["kind"] == "authorship"
    assert body["stats"]["bandCeiling"] == "MEDIUM"
    assert body["stats"]["scoreCap"] == AUTHORSHIP_SCORE_CAP
    assert body["findings"]
    for finding in body["findings"]:
        assert 0.0 <= finding["priorityScore"] <= AUTHORSHIP_SCORE_CAP
        assert finding["priorityBand"] in {"LOW", "MEDIUM"}
        assert 0.0 <= finding["probability"] <= 0.54
        assert finding["evidence"]
        assert finding["evidence"][0]["source"] == "AUTHORSHIP"
        assert set(finding["features"]) == set(AUTHORSHIP_FEATURE_ORDER)


def test_authorship_endpoint_rejects_contamination_and_duplicates():
    payload = _request_payload(_machine_case())
    payload["candidates"][0]["events"] = []
    assert client.post("/analyze/authorship", json=payload).status_code == 422

    payload = _request_payload(_machine_case())
    payload["candidates"].append(payload["candidates"][0])
    assert client.post("/analyze/authorship", json=payload).status_code == 422


def test_root_and_health_advertise_authorship():
    root = client.get("/").json()
    assert "/analyze/authorship" in root["endpoints"]
    assert "not proof" in root["authorshipSemantics"]

    health = client.get("/health").json()
    assert health["authorshipAvailable"] is True
    assert health["authorshipScoreCap"] == AUTHORSHIP_SCORE_CAP
