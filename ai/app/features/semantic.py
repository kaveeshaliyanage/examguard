"""Optional Sentence-BERT similarity. The service must work without this dependency."""

from __future__ import annotations

import logging
import threading

from ..config import settings
from .text import normalize

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_model = None
_state = "unloaded"  # unloaded | ready | unavailable


def status() -> str:
    return _state


def enabled() -> bool:
    return settings.semantic_enabled and _state != "unavailable"


def _load_model():
    global _model, _state
    if not settings.semantic_enabled:
        _state = "unavailable"
        return None
    if _state == "ready":
        return _model
    with _lock:
        if _state == "ready":
            return _model
        try:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(settings.semantic_model)
            _state = "ready"
            logger.info("Loaded semantic model %s", settings.semantic_model)
        except Exception as exc:  # pragma: no cover - depends on optional install
            _state = "unavailable"
            _model = None
            logger.warning("Semantic model unavailable, continuing with lexical features: %s", exc)
    return _model


def pairwise_similarity(texts: list[str]) -> tuple[list[list[float]] | None, str]:
    n = len(texts)
    indexes = [i for i, text in enumerate(texts) if len(normalize(text)) >= 8]
    if len(indexes) < 2:
        return None, _state

    model = _load_model()
    if model is None:
        return None, _state

    try:
        import numpy as np

        corpus = [normalize(texts[i]) for i in indexes]
        embeddings = model.encode(corpus, normalize_embeddings=True, batch_size=16)
        matrix = np.asarray(embeddings) @ np.asarray(embeddings).T

        result = [[0.0] * n for _ in range(n)]
        for i in range(n):
            result[i][i] = 1.0
        for a, ia in enumerate(indexes):
            for b, ib in enumerate(indexes):
                result[ia][ib] = float(max(0.0, min(1.0, matrix[a][b])))
        return result, "sbert"
    except Exception as exc:  # pragma: no cover
        logger.warning("Semantic encoding failed, continuing without it: %s", exc)
        return None, "error"
