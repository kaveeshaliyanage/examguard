from __future__ import annotations

from fastapi.testclient import TestClient

from app.evaluation.synthetic import build_incident_dataset, build_pair_dataset
from app.main import app

client = TestClient(app)


def test_health_and_root():
    health = client.get("/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "UP"
    assert "modelVersion" in body

    root = client.get("/")
    assert root.status_code == 200
    assert "review priority" in root.json()["scoreSemantics"]


def test_pair_endpoint_returns_findings():
    request, _ = build_pair_dataset()
    response = client.post("/analyze/pairs", json=request.model_dump(mode="json"))
    assert response.status_code == 200
    body = response.json()
    assert body["stats"]["kind"] == "pairs"
    assert any(
        finding["type"] == "CANDIDATE_PAIR" for finding in body["findings"]
    )


def test_incident_endpoint_returns_findings():
    request, _ = build_incident_dataset()
    response = client.post("/analyze/incidents", json=request.model_dump(mode="json"))
    assert response.status_code == 200
    body = response.json()
    assert body["stats"]["kind"] == "incidents"
    codes = {finding["candidateA"] for finding in body["findings"]}
    assert codes == {"C04", "C07"}


def test_pair_endpoint_rejects_activity_payload():
    request, _ = build_pair_dataset()
    payload = request.model_dump(mode="json")
    payload["candidates"][0]["events"] = []
    response = client.post("/analyze/pairs", json=payload)
    assert response.status_code == 422


def test_incident_endpoint_rejects_other_candidates_answers():
    request, _ = build_incident_dataset()
    payload = request.model_dump(mode="json")
    payload["questions"] = [{"id": 1, "prompt": "Another candidate's prompt"}]
    response = client.post("/analyze/incidents", json=payload)
    assert response.status_code == 422


def test_analysis_token_is_enforced_only_when_configured(monkeypatch):
    request, _ = build_pair_dataset()
    payload = request.model_dump(mode="json")

    monkeypatch.setenv("ANALYSIS_TOKEN", "shared-secret")
    assert client.post("/analyze/pairs", json=payload).status_code == 401
    wrong = client.post("/analyze/pairs", json=payload, headers={"X-Analysis-Token": "nope"})
    assert wrong.status_code == 401
    ok = client.post(
        "/analyze/pairs", json=payload, headers={"X-Analysis-Token": "shared-secret"}
    )
    assert ok.status_code == 200
    # Health stays open so the platform health check works without the secret.
    assert client.get("/health").status_code == 200

    monkeypatch.delenv("ANALYSIS_TOKEN")
    assert client.post("/analyze/pairs", json=payload).status_code == 200
