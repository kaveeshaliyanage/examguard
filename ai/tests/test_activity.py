from datetime import datetime, timedelta, timezone

from app.features.activity import classify_domain, compute_incident, normalize_domain
from app.schemas import Answer, Event, IncidentCandidate, Revision, Rule

NOW = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
RULES = [
    Rule(category="PERMITTED", domainPattern="*.edu", note="University"),
    Rule(category="PROHIBITED", domainPattern="chegg.com", note="Contract cheating"),
    Rule(category="PROHIBITED", domainPattern="*.studocu.com", note="Uploaded notes"),
]


def test_domain_normalization_and_classification():
    assert normalize_domain("https://www.Chegg.com/some/path?q=1") == "chegg.com"
    assert classify_domain("university.edu", RULES).category == "PERMITTED"
    assert classify_domain("docs.university.edu", RULES).category == "PERMITTED"
    assert classify_domain("chegg.com", RULES).category == "PROHIBITED"
    assert classify_domain("www.studocu.com", RULES).category == "PROHIBITED"
    assert classify_domain("wikipedia.org", RULES).category == "UNCLASSIFIED"


def _candidate(events: list[Event], revisions: list[Revision], connected: bool = True) -> IncidentCandidate:
    answer = Answer(
        questionId=1,
        text=revisions[-1].text if revisions else "",
        revisions=revisions,
    )
    return IncidentCandidate(
        candidateCode="C01",
        attemptId=1,
        answers=[answer],
        events=events,
        monitoringStart=NOW,
        monitoringEnd=NOW + timedelta(minutes=60),
        examDurationMinutes=60,
        extensionConnected=connected,
    )


def test_prohibited_visit_and_answer_change_are_correlated():
    events = [
        Event(eventType="EXTENSION_CONNECTED", occurredAt=NOW + timedelta(seconds=20)),
        Event(eventType="HEARTBEAT", occurredAt=NOW + timedelta(minutes=10)),
        Event(eventType="NAVIGATION", domain="chegg.com", occurredAt=NOW + timedelta(minutes=20)),
        Event(eventType="HEARTBEAT", occurredAt=NOW + timedelta(minutes=50)),
    ]
    revisions = [
        Revision(revisionNo=1, text="A short initial answer about logs.", savedAt=NOW + timedelta(minutes=5)),
        Revision(
            revisionNo=2,
            text="A much longer answer copied after visiting a prohibited domain, with new detail.",
            savedAt=NOW + timedelta(minutes=20, seconds=40),
        ),
    ]
    features = compute_incident(_candidate(events, revisions), RULES)
    assert features is not None
    assert len(features.prohibited) == 1
    assert len(features.correlated) == 1
    assert features.coverageWarning is False


def test_sparse_coverage_is_a_warning_not_clean_evidence():
    events = [
        Event(eventType="EXTENSION_CONNECTED", occurredAt=NOW + timedelta(seconds=20)),
        Event(eventType="NAVIGATION", domain="chegg.com", occurredAt=NOW + timedelta(minutes=5)),
    ]
    features = compute_incident(_candidate(events, []), RULES)
    assert features is not None
    assert features.coverageWarning is True
    assert features.coveragePercent < 60


def test_no_events_means_unknown_and_no_finding():
    features = compute_incident(_candidate([], [], connected=False), RULES)
    assert features is None
