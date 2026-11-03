"""Runtime configuration for the analysis service.

Keep this dependency-free so tests can import the package without FastAPI installed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    model_version: str = "rules-1.0"
    semantic_enabled: bool = field(default_factory=lambda: _flag("SEMANTIC_ENABLED", True))
    semantic_model: str = field(
        default_factory=lambda: os.getenv("SEMANTIC_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    )
    use_learned_fusion: bool = field(default_factory=lambda: _flag("USE_LEARNED_FUSION", False))
    model_dir: Path = field(default_factory=lambda: Path(os.getenv("MODEL_DIR", "models")))
    min_pair_priority: float = field(
        default_factory=lambda: float(os.getenv("MIN_PAIR_PRIORITY", "20"))
    )
    min_incident_priority: float = field(
        default_factory=lambda: float(os.getenv("MIN_INCIDENT_PRIORITY", "10"))
    )


settings = Settings()
