"""Monitoring coverage. Missing observations are unknown, never clean."""

from __future__ import annotations

from datetime import datetime

from ..schemas import Event

GRACE_SECONDS = 120.0


def coverage_percent(events: list[Event], start: datetime, end: datetime) -> float:
    if not events:
        return 0.0
    total_seconds = (end - start).total_seconds()
    if total_seconds <= 0:
        return 0.0
    times = [event.occurredAt for event in events]
    observed = (max(times) - min(times)).total_seconds() + GRACE_SECONDS
    return round(max(0.0, min(100.0, observed / total_seconds * 100.0)), 2)
