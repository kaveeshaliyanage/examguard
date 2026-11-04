from datetime import datetime, timedelta, timezone

from app.evaluation.synthetic import build_pair_dataset
from app.features.timing import build_profile, compute_timing, compute_timing_profiles
from app.schemas import Answer, PairCandidate, Revision

BASE = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
TEXT = (
    "A write-ahead log records redo records before dirty pages reach disk so recovery "
    "can replay committed transactions."
)
SHORT = "Too short to align."


def candidate(code: str, text: str, offsets: list[int]) -> PairCandidate:
    revisions = [
        Revision(revisionNo=index + 1, text=text, savedAt=BASE + timedelta(seconds=offset))
        for index, offset in enumerate(offsets)
    ]
    return PairCandidate(
        candidateCode=code,
        answers=[Answer(questionId=1, text=text, revisions=revisions)],
    )


def test_aligned_change_reports_leader_and_delta():
    a = candidate("A", TEXT, [60])
    b = candidate("B", TEXT, [90])

    result = compute_timing(a, b, [1], window_seconds=120, min_chars=20)

    assert result.score > 0
    assert len(result.aligned) == 1
    aligned = result.aligned[0]
    assert aligned.questionId == 1
    assert aligned.leader == "A"
    assert aligned.follower == "B"
    assert aligned.deltaSeconds == 30
    assert aligned.similarity == 1.0


def test_change_outside_the_window_is_ignored():
    a = candidate("A", TEXT, [0])
    b = candidate("B", TEXT, [300])

    result = compute_timing(a, b, [1], window_seconds=120, min_chars=20)

    assert result.aligned == []
    assert result.score == 0.0
    assert result.finalGapSeconds == 300


def test_answers_below_min_chars_do_not_align():
    a = candidate("A", SHORT, [60])
    b = candidate("B", SHORT, [60])

    result = compute_timing(a, b, [1], window_seconds=120, min_chars=20)

    assert result.aligned == []


def test_profile_path_matches_single_pair_wrapper():
    request, _ = build_pair_dataset()
    candidates = request.candidates
    question_ids = [question.id for question in request.questions]
    profiles = [build_profile(item, question_ids, 20) for item in candidates]

    for i in range(len(candidates)):
        for j in range(i + 1, len(candidates)):
            wrapped = compute_timing(candidates[i], candidates[j], question_ids, 120, 20)
            direct = compute_timing_profiles(profiles[i], profiles[j], question_ids, 120)
            assert wrapped == direct
