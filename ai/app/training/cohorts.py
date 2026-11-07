"""Parameterized synthetic cohorts for training-row export.

The fixed cohort in ``app.evaluation.synthetic`` is small and hand-scripted. Training needs
volume, so this module samples many cohorts from the same text pools and the same label rules.

Labels describe the simulator. A model fitted on them learns the simulator, not real behaviour.
Replace this generator with consented pilot data before making any claim about production.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from ..evaluation.synthetic import INDEPENDENT, PARAPHRASE, QUESTIONS
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

BASE = datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc)

LEAD_INS = (
    "",
    "In practice, ",
    "Put simply, ",
    "At a high level, ",
    "Broadly, ",
    "Usually, ",
    "From experience, ",
)
TAILS = (
    "",
    " That trade-off is deliberate.",
    " This is the usual default.",
    " The cost is duplication.",
    " Teams accept it knowingly.",
)

RARE_FILLERS = (
    "the amber lattice collapses when the quorum epoch is inverted",
    "the cobalt ledger drifts once the parallel quorum resets",
    "the silent meridian folds before the ledger epoch settles",
    "the hidden lattice unwinds while the quorum marker resets",
)

LIGHT_EDITS = (
    ("the ", "a "),
    (" is ", " remains "),
    (" can ", " may "),
    (" so ", " therefore "),
    (" before ", " ahead of "),
    (" after ", " following "),
)

COPY_STYLES = ("exact", "exact", "exact", "light", "light", "rare", "paraphrase", "cross")

PROHIBITED_DOMAINS = ("chegg.com", "coursehero.com", "studocu.com")
PERMITTED_DOMAINS = ("university.edu", "docs.spring.io", "ocw.example.edu")
UNCLASSIFIED_DOMAINS = ("wikipedia.org", "medium.com", "stackoverflow.com")


def _pool(question_index: int) -> list[str]:
    return [row[question_index] for row in INDEPENDENT] + [PARAPHRASE[question_index]]


def _independent_text(rng: random.Random, question_index: int, used: set[str]) -> str:
    for _ in range(30):
        base = rng.choice(_pool(question_index))
        text = rng.choice(LEAD_INS) + base + rng.choice(TAILS)
        if text not in used:
            used.add(text)
            return text
    text = rng.choice(LEAD_INS) + rng.choice(_pool(question_index)) + f" ({rng.randint(1, 999)})"
    used.add(text)
    return text


def _light_edit(rng: random.Random, text: str) -> str:
    source, target = rng.choice(LIGHT_EDITS)
    if source in text:
        text = text.replace(source, target, 1)
    return text.replace(".", ";", 1) if text.endswith(".") else text


def _revisions(final_text: str, final_at: datetime) -> list[Revision]:
    if not final_text:
        return []
    draft = final_text[:70]
    return [
        Revision(revisionNo=1, text=draft, savedAt=final_at - timedelta(seconds=300)),
        Revision(revisionNo=2, text=final_text, savedAt=final_at),
    ]


def generate_pair_cohort(
    rng: random.Random,
    index: int,
) -> tuple[PairAnalysisRequest, dict[tuple[str, str], int]]:
    n = rng.randint(8, 14)
    base = BASE + timedelta(days=index)
    codes = [f"C{position + 1:02d}" for position in range(n)]
    texts: list[list[str]] = [["" for _ in QUESTIONS] for _ in range(n)]
    times: list[list[datetime | None]] = [[None for _ in QUESTIONS] for _ in range(n)]
    used: list[set[str]] = [set() for _ in QUESTIONS]
    rare_used: list[set[str]] = [set() for _ in QUESTIONS]
    copied_pairs: set[tuple[int, int]] = set()
    sparse = set(rng.sample(range(n), k=1 if rng.random() < 0.2 else 0))

    starts = [rng.randint(0, 3600) for _ in range(n)]

    for i in range(n):
        is_copier = i > 0 and rng.random() < 0.28
        donor = rng.randrange(i) if is_copier else None
        copy_count = 0
        if is_copier:
            copy_count = rng.randint(1, 4 if rng.random() < 0.3 else 2)
        copied_questions = set(rng.sample(range(len(QUESTIONS)), copy_count)) if is_copier else set()

        for q, question in enumerate(QUESTIONS):
            if i in sparse and q in (1, 2, 3):
                texts[i][q] = ""
                times[i][q] = base + timedelta(seconds=starts[i] + 150 * q)
                continue

            if donor is not None and q in copied_questions:
                style = rng.choice(COPY_STYLES)
                source_question = q
                if style == "cross":
                    source_question = rng.choice([x for x in range(len(QUESTIONS)) if x != q])
                source_text = texts[donor][source_question]
                source_time = times[donor][source_question] or base

                if style == "exact":
                    text = source_text
                elif style == "light":
                    text = _light_edit(rng, source_text)
                elif style == "rare":
                    pool = [item for item in RARE_FILLERS if item not in rare_used[q]]
                    phrase = rng.choice(pool or list(RARE_FILLERS))
                    rare_used[q].add(phrase)
                    text = source_text + " " + phrase.capitalize() + "."
                    texts[donor][source_question] = text
                elif style == "paraphrase":
                    text = rng.choice(LEAD_INS) + PARAPHRASE[q]
                else:
                    text = source_text

                texts[i][q] = text
                if rng.random() < 0.8:
                    delta = timedelta(seconds=rng.randint(-30, 90))
                else:
                    delta = timedelta(seconds=rng.randint(200, 600))
                times[i][q] = source_time + delta
                copied_pairs.add((donor, i))
            else:
                texts[i][q] = _independent_text(rng, q, used[q])
                times[i][q] = base + timedelta(seconds=starts[i] + 150 * q + rng.randint(0, 60))

    candidates = [
        PairCandidate(
            candidateCode=codes[i],
            attemptId=i + 1,
            answers=[
                Answer(
                    questionId=question.id,
                    text=texts[i][q],
                    revisions=_revisions(texts[i][q], times[i][q] or base),
                )
                for q, question in enumerate(QUESTIONS)
            ],
        )
        for i in range(n)
    ]

    labels: dict[tuple[str, str], int] = {}
    for i in range(n):
        for j in range(i + 1, n):
            copied = (i, j) in copied_pairs
            identical = any(texts[i][q] and texts[i][q] == texts[j][q] for q in range(len(QUESTIONS)))
            labels[(codes[i], codes[j])] = 1 if copied or identical else 0

    request = PairAnalysisRequest(
        examId=1000 + index,
        modelVersion="synthetic-train-1.0",
        questions=QUESTIONS,
        candidates=candidates,
        config=PairConfig(
            minAnswerChars=20,
            similarityThreshold=0.5,
            rareDfMax=3,
            timingWindowSeconds=120,
            maxFindings=500,
        ),
    )
    return request, labels


def _event_stream(
    start: datetime,
    end: datetime,
    visits: list[tuple[str, int]],
) -> list[Event]:
    events = [Event(eventType="EXTENSION_CONNECTED", occurredAt=start + timedelta(seconds=20))]
    minute = 2
    while minute <= 52:
        events.append(Event(eventType="HEARTBEAT", occurredAt=start + timedelta(minutes=minute)))
        minute += 10
    for domain, offset in visits:
        events.append(
            Event(eventType="NAVIGATION", domain=domain, occurredAt=start + timedelta(seconds=offset))
        )
    events.append(Event(eventType="HEARTBEAT", occurredAt=end - timedelta(seconds=60)))
    return sorted(events, key=lambda event: event.occurredAt)


def generate_incident_cohort(
    rng: random.Random,
    index: int,
) -> tuple[IncidentAnalysisRequest, dict[str, int]]:
    start = BASE + timedelta(days=index, hours=2)
    end = start + timedelta(minutes=60)
    rules = [
        Rule(category="PERMITTED", domainPattern="*.edu", note="University resources"),
        Rule(category="PERMITTED", domainPattern="docs.spring.io", note="Documentation"),
        Rule(category="PROHIBITED", domainPattern="chegg.com", note="Contract cheating"),
        Rule(category="PROHIBITED", domainPattern="coursehero.com", note="Contract cheating"),
        Rule(category="PROHIBITED", domainPattern="studocu.com", note="Contract cheating"),
    ]

    n = rng.randint(8, 14)
    candidates: list[IncidentCandidate] = []
    labels: dict[str, int] = {}

    archetypes = (
        "clean",
        "clean",
        "clean",
        "permitted",
        "unclassified",
        "unclassified",
        "unclassified",
        "unclassified",
        "unclassified",
        "prohibited_correlated",
        "prohibited_only",
        "sparse",
        "disconnected",
    )

    for position in range(n):
        code = f"C{position + 1:02d}"
        archetype = rng.choice(archetypes)
        texts = [rng.choice(_pool(q)) for q in range(len(QUESTIONS))]

        visits: list[tuple[str, int]] = []
        final_offsets = [600, 960, 1560, 2040]
        if archetype == "permitted":
            visits = [(rng.choice(PERMITTED_DOMAINS), rng.randint(300, 2400))]
        elif archetype == "unclassified":
            visits = [(rng.choice(UNCLASSIFIED_DOMAINS), rng.randint(300, 2400))]
            if rng.random() < 0.5:
                visits.append((rng.choice(UNCLASSIFIED_DOMAINS), rng.randint(2400, 3000)))
        elif archetype in {"prohibited_correlated", "prohibited_only"}:
            first = rng.randint(300, 2200)
            visits = [(rng.choice(PROHIBITED_DOMAINS), first)]
            if rng.random() < 0.4:
                visits.append((rng.choice(PROHIBITED_DOMAINS), first + rng.randint(300, 900)))
            if archetype == "prohibited_correlated":
                target_question = rng.randrange(len(QUESTIONS))
                delta = rng.randint(20, 100)
                final_offsets[target_question] = first + delta
                # A second visit near a material change exercises repeat + correlation together.
                if rng.random() < 0.3:
                    visits.append((PROHIBITED_DOMAINS[position % len(PROHIBITED_DOMAINS)], first + 400))
                    final_offsets[(target_question + 1) % len(QUESTIONS)] = first + 400 + delta
        elif archetype == "sparse":
            visits = [(rng.choice(PROHIBITED_DOMAINS), rng.randint(300, 900))]

        connected = archetype != "disconnected"
        events = [Event(eventType="EXTENSION_CONNECTED", occurredAt=start + timedelta(seconds=20))]
        if archetype == "sparse":
            events += [
                Event(eventType="NAVIGATION", domain=domain, occurredAt=start + timedelta(seconds=offset))
                for domain, offset in visits
            ]
        elif connected:
            events = _event_stream(start, end, visits)
        else:
            events = []

        answers = []
        for q, question in enumerate(QUESTIONS):
            final_at = start + timedelta(seconds=final_offsets[q])
            text = texts[q]
            if archetype in {"prohibited_correlated", "prohibited_only"} and q == 0:
                draft = text[:40]
                answers.append(
                    Answer(
                        questionId=question.id,
                        text=text,
                        revisions=[
                            Revision(revisionNo=1, text=draft, savedAt=final_at - timedelta(seconds=300)),
                            Revision(revisionNo=2, text=text, savedAt=final_at),
                        ],
                    )
                )
            else:
                answers.append(
                    Answer(
                        questionId=question.id,
                        text=text,
                        revisions=[
                            Revision(revisionNo=1, text=text[:40], savedAt=final_at - timedelta(seconds=300)),
                            Revision(revisionNo=2, text=text, savedAt=final_at),
                        ],
                    )
                )

        candidates.append(
            IncidentCandidate(
                candidateCode=code,
                attemptId=position + 1,
                answers=answers,
                events=events,
                monitoringStart=start,
                monitoringEnd=end,
                examDurationMinutes=60,
                extensionConnected=connected,
            )
        )
        labels[code] = 1 if archetype in {"prohibited_correlated", "prohibited_only", "sparse"} else 0

    request = IncidentAnalysisRequest(
        examId=2000 + index,
        modelVersion="synthetic-train-1.0",
        candidates=candidates,
        rules=rules,
        config=IncidentConfig(timingWindowSeconds=120, minCoveragePercent=60, maxFindings=500),
    )
    return request, labels
