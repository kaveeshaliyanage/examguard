from app.evaluation.metrics import (
    average_precision,
    false_alarms_per_100,
    precision_at_k,
    precision_recall_f1,
)


def test_known_average_precision():
    labels = [1, 0, 1]
    scores = [0.9, 0.8, 0.7]
    assert round(average_precision(labels, scores), 4) == 0.8333


def test_precision_at_k_and_false_alarms():
    labels = [1, 0, 1, 0, 0]
    scores = [0.9, 0.8, 0.7, 0.2, 0.1]
    assert precision_at_k(labels, scores, 2) == 0.5
    assert false_alarms_per_100(labels, [1, 1, 1, 0, 0]) == 20.0
    precision, recall, f1 = precision_recall_f1(labels, [1, 0, 1, 0, 0])
    assert (precision, recall, f1) == (1.0, 1.0, 1.0)
