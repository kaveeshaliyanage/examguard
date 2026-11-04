"""Deterministic synthetic cohorts for pipeline tests and ablation demonstrations.

These labels describe the simulation. They are not evidence that any real behaviour was detected.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..schemas import (
    Answer,
    Event,
    IncidentAnalysisRequest,
    IncidentCandidate,
    IncidentConfig,
    PairAnalysisRequest,
    PairCandidate,
    PairConfig,
    Question,
    Revision,
    Rule,
)

BASE = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)

QUESTIONS = [
    Question(id=1, prompt="Explain why a write-ahead log is used. Give one failure it prevents and one cost."),
    Question(id=2, prompt="How does a Manifest V3 extension do background work? Give one limitation."),
    Question(id=3, prompt="Explain an epoch-invalidation failure during a long read and how to detect it."),
    Question(id=4, prompt="How would you evaluate a short-answer similarity detector without misconduct labels?"),
]

INDEPENDENT = [
    [
        "A write-ahead log records redo records before dirty pages reach disk, so recovery can replay committed transactions and avoid torn pages.",
        "Manifest V3 runs background logic in an event-driven service worker that can be stopped, so alarms schedule work and storage keeps state.",
        "A reader holding an old epoch may write stale entries after the epoch advances; validate the epoch after the read or version the entries.",
        "Use copy, paraphrase and independent pairs with hard negatives, report precision at k, and split by cohort.",
    ],
    [
        "The WAL makes committed changes durable before page flush; after a crash the redo log is replayed and acknowledged transactions survive.",
        "MV3 service workers are terminated when idle, so durable state belongs in chrome.storage and periodic jobs use alarms.",
        "An old epoch can repopulate the cache with stale data; a post-read epoch check detects the race.",
        "Evaluate ranking with precision at k and false alarms per review budget on held-out cohorts.",
    ],
    [
        "Write-ahead logging flushes log records ahead of data pages, allowing crash recovery to replay committed transactions.",
        "A Manifest V3 service worker handles events and can be evicted, requiring alarms and external state.",
        "Epoch invalidation fails when a long read writes back after the epoch changes; compare the epoch before and after.",
        "Build a labelled pair set with hard negatives and hold out whole cohorts; report average precision.",
    ],
    [
        "A WAL is an append-only record used to redo committed work after a failure and to prevent partially written pages.",
        "MV3 background work is event driven; the service worker may stop, so use alarms and storage.",
        "Readers can insert stale values if the epoch advances mid-read; version entries to detect it.",
        "Measure precision at k and false alarms on cohort splits with correct-but-similar negatives.",
    ],
    [
        "Write-ahead logging stores changes before pages so recovery can replay them and keep acknowledged commits.",
        "Manifest V3 moves background tasks to a service worker with alarms and chrome.storage for persistence.",
        "A stale reader may write after an epoch change; validate the epoch or use per-entry versions.",
        "Use copy and paraphrase labels plus hard negatives, and report precision at k on held-out cohorts.",
    ],
    [
        "The redo log is written before data pages, which lets the database recover committed transactions after a crash.",
        "MV3 service workers are ephemeral, so scheduling uses alarms and state lives in chrome.storage.",
        "An epoch change during a read can allow stale writes; check the epoch after reading.",
        "Evaluate with independent, copy and paraphrase pairs and correct-similar hard negatives.",
    ],
]

PARAPHRASE = [
    "Redo information is persisted before data pages are flushed; recovery replays committed work and avoids partially written pages.",
    "In Manifest V3, background logic lives in a service worker that the browser can halt; alarms and storage provide persistence.",
    "When invalidation epochs move during a slow read, an old reader may store stale values; check the epoch after the read or version entries.",
    "Assess with copied, paraphrased and independent answer pairs plus hard negatives, using precision at k and cohort-level splits.",
]

RARE_PHRASE = "the amber lattice collapses when the quorum epoch is inverted"
QUORUM_MISSPELLING = "the quorom lantern"


def _revisions(text: str, final_at: datetime) -> list[Revision]:
    draft = text[:70] + "..." if len(text) > 70 else text
    return [
        Revision(revisionNo=1, text=draft, savedAt=final_at - timedelta(seconds=300)),
        Revision(revisionNo=2, text=text, savedAt=final_at),
    ]


def _candidate(code: str, texts: list[str], final_times: list[datetime]) -> PairCandidate:
    return PairCandidate(
        candidateCode=code,
        attemptId=int(code[1:]) if code[1:].isdigit() else None,
        answers=[
            Answer(questionId=question.id, text=texts[index], revisions=_revisions(texts[index], final_times[index]))
            for index, question in enumerate(QUESTIONS)
        ],
    )


def build_pair_dataset() -> tuple[PairAnalysisRequest, dict[tuple[str, str], int]]:
    def times(offset_seconds: int) -> list[datetime]:
        return [BASE + timedelta(seconds=offset_seconds + 120 * q) for q in range(4)]

    c01_texts = list(INDEPENDENT[0])
    c02_texts = list(INDEPENDENT[0])
    for q in (0, 2):
        c02_texts[q] = c02_texts[q] + " " + RARE_PHRASE.capitalize() + "."

    c03_texts = list(PARAPHRASE)

    c04_texts = list(INDEPENDENT[1])
    c05_texts = list(INDEPENDENT[1])
    for q in (0, 2):
        c05_texts[q] = c05_texts[q] + " " + RARE_PHRASE.capitalize() + "."

    c06_texts = list(INDEPENDENT[2])
    c07_texts = list(INDEPENDENT[2])
    for q in (1, 3):
        c06_texts[q] = c06_texts[q] + " Students recieve " + QUORUM_MISSPELLING + "."
        c07_texts[q] = c07_texts[q] + " Students recieve " + QUORUM_MISSPELLING + "."

    candidates = [
        _candidate("C01", c01_texts, times(0)),
        _candidate("C02", c02_texts, [t + timedelta(seconds=35) if i in (0, 2) else t + timedelta(seconds=80)
                                      for i, t in enumerate(times(0))]),
        _candidate("C03", c03_texts, times(150)),
        _candidate("C04", c04_texts, times(300)),
        _candidate("C05", c05_texts, [t + timedelta(seconds=25) if i in (0, 2) else t + timedelta(seconds=100)
                                      for i, t in enumerate(times(300))]),
        _candidate("C06", c06_texts, times(600)),
        _candidate("C07", c07_texts, times(620)),
        _candidate("C08", list(INDEPENDENT[3]), times(900)),
        _candidate("C09", list(INDEPENDENT[4]), times(1200)),
        _candidate("C10", list(INDEPENDENT[5]), times(1500)),
    ]

    positives = {("C01", "C02"), ("C01", "C03"), ("C04", "C05"), ("C06", "C07")}
    labels: dict[tuple[str, str], int] = {}
    codes = [c.candidateCode for c in candidates]
    for i in range(len(codes)):
        for j in range(i + 1, len(codes)):
            labels[(codes[i], codes[j])] = 1 if (codes[i], codes[j]) in positives else 0

    request = PairAnalysisRequest(
        examId=1,
        modelVersion="synthetic-1.0",
        questions=QUESTIONS,
        candidates=candidates,
        config=PairConfig(minAnswerChars=20, similarityThreshold=0.5, rareDfMax=3,
                          timingWindowSeconds=120, maxFindings=500),
    )
    return request, labels


def _events(start: datetime, end: datetime, extra_domains: list[str]) -> list[Event]:
    events = [Event(eventType="EXTENSION_CONNECTED", occurredAt=start + timedelta(seconds=20))]
    minute = 2
    while minute <= 52:
        events.append(Event(eventType="HEARTBEAT", occurredAt=start + timedelta(minutes=minute)))
        minute += 10
    for index, domain in enumerate(extra_domains):
        events.append(
            Event(
                eventType="NAVIGATION",
                domain=domain,
                occurredAt=start + timedelta(seconds=600 + index * 300),
            )
        )
    events.append(Event(eventType="HEARTBEAT", occurredAt=end - timedelta(seconds=60)))
    return sorted(events, key=lambda e: e.occurredAt)


def build_incident_dataset() -> tuple[IncidentAnalysisRequest, dict[str, int]]:
    start = BASE
    end = BASE + timedelta(minutes=60)
    rules = [
        Rule(category="PERMITTED", domainPattern="*.edu", note="University resources"),
        Rule(category="PERMITTED", domainPattern="docs.spring.io", note="Documentation"),
        Rule(category="PROHIBITED", domainPattern="chegg.com", note="Contract cheating"),
        Rule(category="PROHIBITED", domainPattern="coursehero.com", note="Contract cheating"),
    ]

    def candidate(code: str, base_index: int, extra: list[str], connected: bool = True,
                  sparse: bool = False) -> IncidentCandidate:
        texts = list(INDEPENDENT[base_index])
        # C04's second prohibited visit (+900s) must land within 120s of a material change,
        # so question 2 finishes at +960s rather than +1080s.
        final_times = [start + timedelta(seconds=offset) for offset in (600, 960, 1560, 2040)]
        answers = [
            Answer(questionId=QUESTIONS[q].id, text=texts[q], revisions=_revisions(texts[q], final_times[q]))
            for q in range(4)
        ]
        events = _events(start, end, extra) if connected and not sparse else (
            [Event(eventType="EXTENSION_CONNECTED", occurredAt=start + timedelta(seconds=20))]
            + [Event(eventType="NAVIGATION", domain=d, occurredAt=start + timedelta(minutes=8))
               for d in extra]
        )
        if not connected:
            events = []
        return IncidentCandidate(
            candidateCode=code,
            attemptId=int(code[1:]),
            answers=answers,
            events=events,
            monitoringStart=start,
            monitoringEnd=end,
            examDurationMinutes=60,
            extensionConnected=connected,
        )

    candidates = [
        candidate("C01", 0, []),
        candidate("C02", 1, ["university.edu"]),
        candidate("C03", 2, ["docs.spring.io"]),
        candidate("C04", 3, ["chegg.com", "coursehero.com"]),
        candidate("C05", 4, ["wikipedia.org"]),
        candidate("C06", 5, ["university.edu"]),
        candidate("C07", 0, ["coursehero.com"], sparse=True),
        candidate("C08", 1, [], connected=False),
        candidate("C09", 2, []),
        candidate("C10", 3, []),
    ]

    labels = {"C01": 0, "C02": 0, "C03": 0, "C04": 1, "C05": 0,
              "C06": 0, "C07": 1, "C08": 0, "C09": 0, "C10": 0}
    request = IncidentAnalysisRequest(
        examId=1,
        modelVersion="synthetic-1.0",
        candidates=candidates,
        rules=rules,
        config=IncidentConfig(timingWindowSeconds=120, minCoveragePercent=60, maxFindings=500),
    )
    return request, labels
