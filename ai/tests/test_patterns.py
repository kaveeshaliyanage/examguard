from datetime import datetime, timedelta, timezone

from app.features.patterns import compute_patterns
from app.schemas import Answer, PairCandidate, Revision

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
RARE = "the amber lattice collapses when the quorum epoch is inverted"


def candidate(code: str, texts: list[str]) -> PairCandidate:
    answers = []
    for index, text in enumerate(texts, start=1):
        answers.append(
            Answer(
                questionId=index,
                text=text,
                revisions=[Revision(revisionNo=1, text=text, savedAt=NOW + timedelta(minutes=index))],
            )
        )
    return PairCandidate(candidateCode=code, attemptId=1, answers=answers)


def test_shared_rare_phrase_is_detected():
    a = candidate("C01", [
        f"A write-ahead log records changes before pages. {RARE}.",
        "MV3 service workers use alarms and storage.",
    ])
    b = candidate("C02", [
        f"The WAL persists changes before disk. {RARE}.",
        "A Manifest V3 worker is event driven and uses chrome.storage.",
    ])
    c = candidate("C03", [
        "Database journals protect committed transactions after a crash by replaying redo information.",
        "A service worker is event driven, so alarms schedule periodic background checks.",
    ])
    d = candidate("C04", [
        "Durable storage keeps acknowledged writes, and recovery rebuilds a consistent page image.",
        "Extensions wake for browser events and persist durable state outside the worker.",
    ])
    e = candidate("C05", [
        "Reviewers compare copied, paraphrased and independent answers using precision at k.",
        "Held-out cohorts and hard negatives keep the estimate honest.",
    ])

    # df_max=2 makes "rare" meaningful: a phrase shared by only these two candidates counts.
    patterns = compute_patterns([a, b, c, d, e], [1, 2], df_max=2)
    shared = patterns[("C01", "C02")]
    independent = patterns[("C01", "C03")]

    assert shared.rare_score > 0.3
    assert any("amber lattice" in shingle for shingle in shared.shared_shingles)
    assert shared.rare_score > independent.rare_score
    assert any("amber" in token for token in shared.shared_tokens)
