"""Parameterized synthetic authorship cohorts.

The generator writes human-like and machine-like prose from fixed sentence pools with a seeded
RNG, so exports and CI runs are deterministic and offline. Labels describe the simulator:
``1`` means "machine-like by construction", not "a student used AI".

Human-like answers vary sentence and paragraph length, use contractions, dashes and
parentheses, and arrive through several growing revisions. Machine-like answers keep sentence
length even, avoid contractions, lean on formal connectives and repeated bigrams, use balanced
paragraphs, and appear almost fully formed in one revision. A stylometry model trained here
learns that contrast, which is why the model card calls the metrics synthetic.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from ..schemas import (
    AuthorshipAnswer,
    AuthorshipCandidate,
    AuthorshipConfig,
    AuthorshipRequest,
    AuthorshipRevision,
)

BASE = datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc)
QUESTION_IDS = (1, 2, 3, 4)

HUMAN_SENTENCES = (
    "I'd take the boring solution first, then revisit it when the data says otherwise.",
    "Readability beats cleverness almost every time, though there are exceptions - parsers are one.",
    "The honest answer is that it depends on how often the path runs; a hot loop and a nightly job do not deserve the same care.",
    "We tried the fancy cache and it broke during deploys, which nobody had budgeted for.",
    "Ship the simple version, measure it, and only then argue about microseconds.",
    "A review should ask what happens at 3 a.m.; that question finds more bugs than style debates.",
    "Yes, it's slower, but the failure mode is a retry instead of a corrupted record.",
    "I'd rather have a dull design that the next person can read (even tired) than a clever one they fear.",
    "First I check what changed, because it's almost always a deploy, a flag, or a certificate.",
    "The dashboards said healthy while users were failing - the gap was the actual bug.",
    "We bisected the traffic, not the commits, and that narrowed it down in about ten minutes.",
    "Logs lie by omission; traces usually tell you where the time actually went.",
    "I keep a scratch file of hypotheses and cross them out; it stops me from looping.",
    "Sometimes the fastest path is to reproduce it locally with the exact payload - ugly, but it works.",
    "A design is done when the failure modes are written down and someone else can operate it.",
    "Not when the diagram looks nice; when a new engineer can deploy it without asking me.",
    "I stop when further changes cost more than the problem they solve, and I say that out loud.",
    "Measure the thing you actually care about, not the thing the vendor puts on the dashboard.",
    "We ran it for a sprint with a control group; the results were... underwhelming, honestly.",
    "If it saves one hour a week per person, it pays for itself; otherwise it's a hobby.",
    "Ask the people who use it daily. Surveys are fine, but the complaints in chat are better.",
    "The maintenance cost is real, and it doesn't show up in the demo.",
    "Caching is easy until you have to explain why the old value is still there on Tuesday.",
    "I've seen more incidents from configuration drift than from bad algorithms.",
    "The trade-off I care about is how quickly we can undo the change at 2 a.m.",
)

MACHINE_SENTENCES = (
    "It is important to note that the proposed approach provides a reliable foundation for the analysis.",
    "Moreover, the system ensures that the relevant data remains consistent during the operation.",
    "Furthermore, the process must be validated before the final result is recorded.",
    "In addition, the implementation should document the assumptions that support the decision.",
    "Overall, the approach provides a structured basis for evaluating the available evidence.",
    "It is important to note that the analysis must be repeated when the underlying data changes.",
    "Moreover, the method maintains a consistent level of quality across the evaluated cases.",
    "Furthermore, the results indicate that the proposed solution performs well in practice.",
    "In addition, the framework supports a systematic review of the collected observations.",
    "Overall, the findings suggest that the method provides measurable improvements in quality.",
)

MACHINE_TAIL = (
    " It is important to note that the outcome remains consistent across the evaluated cases."
)


def _word_count(text: str) -> int:
    return len(text.split())


def _revision_words(prefix: str, final_words: list[str], fraction: float) -> str:
    count = max(1, int(len(final_words) * fraction))
    text = " ".join(final_words[:count]).rstrip(".,;:")
    return prefix + text + "."


def _human_answer(rng: random.Random) -> tuple[str, list[str]]:
    sentences = rng.sample(HUMAN_SENTENCES, k=rng.randint(5, 7))
    while len(sentences) < 7 and rng.random() < 0.5:
        extra = rng.choice(HUMAN_SENTENCES)
        if extra not in sentences:
            sentences.append(extra)
    split = rng.choice((1, 1, 2, 2, 3))
    paragraphs = [" ".join(sentences[:split]), " ".join(sentences[split:])]
    text = "\n\n".join(part for part in paragraphs if part)
    if len(text) < 260:
        text += " " + rng.choice(HUMAN_SENTENCES)
    return text, sentences


def _machine_answer(rng: random.Random) -> tuple[str, list[str]]:
    sentences = rng.sample(MACHINE_SENTENCES, k=6)
    paragraphs = [" ".join(sentences[:3]), " ".join(sentences[3:])]
    text = "\n\n".join(paragraphs)
    return text, sentences


def _revisions(
    rng: random.Random,
    final_text: str,
    final_at: datetime,
    *,
    machine: bool,
) -> list[AuthorshipRevision]:
    words = final_text.split()

    def revision(number: int, text: str, seconds_before: int) -> AuthorshipRevision:
        return AuthorshipRevision(
            revisionNo=number,
            text=text,
            savedAt=final_at - timedelta(seconds=seconds_before),
            wordCount=_word_count(text),
        )

    if machine:
        # Almost fully formed on the first save; a short generic sentence is appended later.
        first = final_text
        second = final_text + MACHINE_TAIL
        return [
            revision(1, first, 420),
            revision(2, second, 0),
        ]

    first = _revision_words("", words, rng.uniform(0.22, 0.34))
    middle = _revision_words("", words, rng.uniform(0.55, 0.72))
    return [
        revision(1, first, 900),
        revision(2, middle, 420),
        revision(3, final_text, 0),
    ]


def generate_authorship_case(
    rng: random.Random,
    index: int,
) -> tuple[AuthorshipRequest, dict[tuple[str, int], int]]:
    """One candidate, four answers, deterministic given ``rng`` and ``index``."""
    code = f"C{index + 1:04d}"
    machine = rng.random() < 0.5
    base = BASE + timedelta(days=index)
    answers: list[AuthorshipAnswer] = []
    labels: dict[tuple[str, int], int] = {}

    for position, question_id in enumerate(QUESTION_IDS):
        if machine:
            text, _ = _machine_answer(rng)
        else:
            text, _ = _human_answer(rng)

        # A small share of answers is deliberately too short to score, exercising the skip path.
        if rng.random() < 0.05:
            text = text[:150]

        final_at = base + timedelta(seconds=600 * position + rng.randint(0, 240))
        answers.append(
            AuthorshipAnswer(
                questionId=question_id,
                text=text,
                revisions=_revisions(rng, text, final_at, machine=machine),
            )
        )
        labels[(code, question_id)] = 1 if machine else 0

    request = AuthorshipRequest(
        examId=4000 + index,
        modelVersion="synthetic-authorship-1.0",
        candidates=[
            AuthorshipCandidate(
                candidateCode=code,
                attemptId=index + 1,
                answers=answers,
            )
        ],
        config=AuthorshipConfig(minAnswerChars=200, maxFindings=200),
    )
    return request, labels
