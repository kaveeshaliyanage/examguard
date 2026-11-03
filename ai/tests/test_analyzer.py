"""End-to-end behaviour of the two analysis pipelines on the scripted cohort.

These tests assert what the simulator was built to exercise. They do not claim that the
signals identify real misconduct.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.evaluation.synthetic import build_incident_dataset, build_pair_dataset
from app.schemas import PairAnalysisRequest
from app.services.analyzer import analyze_incidents, analyze_pairs


@pytest.fixture(scope="module")
def pair_response():
    request, _labels = build_pair_dataset()
    return analyze_pairs(request)


@pytest.fixture(scope="module")
def incident_response():
    request, _labels = build_incident_dataset()
    return analyze_incidents(request)


def _finding(response, a: str, b: str | None = None):
    for finding in response.findings:
        if b is None:
            if finding.type == "CANDIDATE_INCIDENT" and finding.candidateA == a:
                return finding
        elif {finding.candidateA, finding.candidateB} == {a, b}:
            return finding
    return None


def test_pair_pipeline_finds_the_shared_rare_phrase(pair_response):
    finding = _finding(pair_response, "C01", "C02")
    assert finding is not None
    assert finding.type == "CANDIDATE_PAIR"
    assert finding.candidateB is not None
    assert 0.0 < finding.priorityScore <= 100.0
    assert finding.priorityBand in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}

    sources = {item.source for item in finding.evidence}
    assert "PATTERN" in sources
    pattern = next(item for item in finding.evidence if item.source == "PATTERN")
    assert pattern.weight > 0
    assert any(
        counts["sharedShingles"] > 0 for counts in pattern.metadata["perQuestion"].values()
    )
    assert "distinctive shared wording" in finding.summary


def test_pair_pipeline_keeps_priorities_bounded_and_sorted(pair_response):
    scores = [finding.priorityScore for finding in pair_response.findings]
    assert scores == sorted(scores, reverse=True)
    assert all(0.0 <= score <= 100.0 for score in scores)
    assert pair_response.stats["lexicalBackend"] == "tfidf"
    assert pair_response.stats["kind"] == "pairs"
    assert pair_response.stats["pairsEvaluated"] == 45


def test_pair_request_cannot_carry_activity_events():
    request, _ = build_pair_dataset()
    payload = request.model_dump(mode="json")
    payload["candidates"][0]["events"] = [
        {"eventType": "NAVIGATION", "domain": "chegg.com", "occurredAt": "2026-01-01T09:10:00Z"}
    ]
    with pytest.raises(ValidationError):
        PairAnalysisRequest.model_validate(payload)


def test_incident_pipeline_flags_prohibited_visits_for_the_right_candidates(incident_response):
    codes = {finding.candidateA for finding in incident_response.findings}
    assert codes == {"C04", "C07"}

    c04 = _finding(incident_response, "C04")
    assert c04 is not None
    assert c04.candidateB is None
    assert c04.type == "CANDIDATE_INCIDENT"
    sources = {item.source for item in c04.evidence}
    assert {"ACTIVITY", "ANSWER_CHANGE"} <= sources
    assert c04.coverageWarning is False

    change = next(item for item in c04.evidence if item.source == "ANSWER_CHANGE")
    assert len(change.metadata["changes"]) == 2
    assert {item["domain"] for item in change.metadata["changes"]} == {
        "chegg.com",
        "coursehero.com",
    }


def test_incident_pipeline_caps_sparse_monitoring(incident_response):
    c07 = _finding(incident_response, "C07")
    assert c07 is not None
    assert c07.coverageWarning is True
    assert c07.priorityScore <= 45.0
    assert any(item.source == "COVERAGE" for item in c07.evidence)


def test_incident_pipeline_ignores_permitted_only_and_disconnected_candidates(incident_response):
    for code in ("C01", "C02", "C03", "C06", "C08", "C09", "C10"):
        assert _finding(incident_response, code) is None


def test_no_extension_events_means_unknown_not_clean():
    request, _labels = build_incident_dataset()
    c08 = next(c for c in request.candidates if c.candidateCode == "C08")
    assert c08.extensionConnected is False
    assert c08.events == []
    # Absence of observations must never produce an incident finding.
    response = analyze_incidents(
        request.model_copy(update={"candidates": [c08]})
    )
    assert response.findings == []
