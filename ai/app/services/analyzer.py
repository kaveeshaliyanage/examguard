"""Pair and incident analysis entry points.

The two entry points take different request models on purpose. A pair request cannot carry
activity events; an incident request cannot carry another candidate's answers.
"""

from __future__ import annotations

from .incident_analysis import analyze_incidents
from .pair_analysis import analyze_pairs

__all__ = ["analyze_incidents", "analyze_pairs"]
