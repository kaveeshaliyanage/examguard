"""Scale check for the stated acceptance target: 100 candidates, four questions, <= 10 seconds."""

import time

from app.evaluation.synthetic import build_pair_dataset
from app.services.analyzer import analyze_pairs

CANDIDATES = 100
QUESTIONS = 4
MAX_SECONDS = 10.0


def scale_request(candidate_count: int):
    request, _ = build_pair_dataset()
    base = request.candidates
    candidates = []
    for index in range(candidate_count):
        clone = base[index % len(base)].model_copy(deep=True)
        clone.candidateCode = f"C{index + 1:03d}"
        candidates.append(clone)
    return request.model_copy(update={"candidates": candidates})


def test_pair_analysis_100_candidates_within_ten_seconds():
    request = scale_request(CANDIDATES)
    assert len(request.questions) == QUESTIONS

    # Warm-up keeps one-time scikit-learn imports out of the measurement.
    analyze_pairs(scale_request(10))

    started = time.perf_counter()
    response = analyze_pairs(request)
    elapsed = time.perf_counter() - started

    assert response.stats["pairsEvaluated"] == CANDIDATES * (CANDIDATES - 1) // 2
    assert len(response.findings) <= request.config.maxFindings
    print(f"\n100 candidates x 4 questions: {elapsed:.2f}s (limit {MAX_SECONDS:.0f}s)")
    assert elapsed < MAX_SECONDS, (
        f"pair analysis took {elapsed:.2f}s at 100 candidates; "
        f"the documented target is {MAX_SECONDS:.0f}s"
    )
