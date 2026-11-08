"""Pair, incident and authorship analysis entry points.

The entry points take different request models on purpose. A pair request cannot carry
activity events; an incident request cannot carry another candidate's answers; an authorship
request describes one candidate's prose and never compares candidates.
"""

from __future__ import annotations

from .authorship_analysis import analyze_authorship
from .incident_analysis import analyze_incidents
from .pair_analysis import analyze_pairs

__all__ = ["analyze_authorship", "analyze_incidents", "analyze_pairs"]
