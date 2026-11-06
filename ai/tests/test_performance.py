"""Scale check for the stated acceptance target: 100 candidates, four questions, <= 10 seconds."""

import time

from app.evaluation.synthetic import build_pair_dataset
from app.services.analyzer import analyze_pairs

CANDIDATES = 100
QUESTIONS = 4
SAMPLES = 3
MAX_SECONDS = 10.0


def scale_request(candidate_count: int):
    request, _ = build_pair_dataset()
    base = request.candidates
    candidates = []
    for index in range(candidate_count):
        clone = base[index % len(base)].model_copy(deep=True)
        clone.candidateCode = f"C{index + 1:03d}"
        # Distinct text per candidate keeps the cohort from sharing cached comparisons.
        for answer in clone.answers:
            for revision in answer.revisions:
                revision.text = f"{revision.text} Candidate {index + 1:03d} variant {index % 7}."
        candidates.append(clone)
    return request.model_copy(update={"candidates": candidates})


def test_pair_analysis_100_candidates_within_ten_seconds():
    request = scale_request(CANDIDATES)
    assert len(request.questions) == QUESTIONS

    # Warm-up keeps one-time scikit-learn imports out of the measurement.
    analyze_pairs(scale_request(10))

    durations = []
    response = None
    for _ in range(SAMPLES):
        started = time.perf_counter()
        response = analyze_pairs(request)
        durations.append(time.perf_counter() - started)

    median = sorted(durations)[SAMPLES // 2]
    assert response is not None
    assert response.stats["pairsEvaluated"] == CANDIDATES * (CANDIDATES - 1) // 2
    assert len(response.findings) <= request.config.maxFindings
    samples = ", ".join(f"{duration:.2f}s" for duration in durations)
    print(f"\n100 candidates x 4 questions: median {median:.2f}s (samples {samples}; limit {MAX_SECONDS:.0f}s)")
    assert median < MAX_SECONDS, (
        f"pair analysis median was {median:.2f}s at 100 candidates; "
        f"the documented target is {MAX_SECONDS:.0f}s"
    )
