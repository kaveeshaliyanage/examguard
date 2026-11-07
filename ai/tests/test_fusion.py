from app.features.fusion import (
    fuse_incident,
    fuse_pair,
    pair_weights,
    priority_band,
)


def test_band_thresholds():
    assert priority_band(0) == "LOW"
    assert priority_band(29.9) == "LOW"
    assert priority_band(30) == "MEDIUM"
    assert priority_band(55) == "HIGH"
    assert priority_band(75) == "CRITICAL"


def test_pair_weights_renormalize_without_semantic():
    weights = pair_weights(False)
    assert "semantic" not in weights
    assert abs(sum(weights.values()) - 1.0) < 1e-9


def test_pair_fusion_caps_incomplete_comparisons():
    result = fuse_pair(
        {"lexical": 1.0, "semantic": 0.0, "rare": 1.0, "cross": 1.0, "timing": 1.0},
        semantic_available=False,
        completeness_warning=True,
        coverage_warning=True,
    )
    assert result.score <= 35.0
    assert result.capped is True


def test_incident_fusion_caps_low_coverage():
    result = fuse_incident(
        {"prohibited": 1.0, "correlated": 1.0, "repeat": 1.0, "unclassified": 1.0},
        low_coverage=True,
        only_unclassified=False,
    )
    assert result.score <= 45.0


def test_learned_pair_fusion_still_caps_incomplete_coverage(monkeypatch):
    monkeypatch.setattr("app.features.fusion._learned", lambda kind, vector: 99.0)
    result = fuse_pair(
        {"lexical": 1.0, "semantic": 0.0, "rare": 1.0, "cross": 1.0, "timing": 1.0},
        semantic_available=False,
        completeness_warning=True,
        coverage_warning=True,
    )
    assert result.learned is True
    assert result.score <= 35.0
    assert result.capped is True


def test_learned_incident_fusion_still_caps_low_coverage(monkeypatch):
    monkeypatch.setattr("app.features.fusion._learned", lambda kind, vector: 99.0)
    result = fuse_incident(
        {"prohibited": 1.0, "correlated": 1.0, "repeat": 1.0, "unclassified": 0.0},
        low_coverage=True,
        only_unclassified=False,
    )
    assert result.learned is True
    assert result.score <= 45.0


def test_learned_incident_fusion_still_caps_unclassified_only(monkeypatch):
    monkeypatch.setattr("app.features.fusion._learned", lambda kind, vector: 99.0)
    result = fuse_incident(
        {"prohibited": 0.0, "correlated": 0.0, "repeat": 0.0, "unclassified": 0.5},
        low_coverage=False,
        only_unclassified=True,
    )
    assert result.score <= 40.0
