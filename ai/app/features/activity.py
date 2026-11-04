"""Resource rule classification and candidate-level incident features."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from difflib import SequenceMatcher

from ..schemas import IncidentCandidate, Rule
from .coverage import coverage_percent
from .text import normalize

VISIT_EVENTS = {"NAVIGATION"}


@dataclass
class RuleHit:
    category: str
    pattern: str
    note: str | None


@dataclass
class DomainVisit:
    domain: str
    occurredAt: datetime
    category: str
    pattern: str | None
    note: str | None = None


@dataclass
class CorrelatedChange:
    questionId: int
    revisionNo: int
    domain: str
    visitAt: datetime
    savedAt: datetime
    deltaSeconds: float
    deltaChars: int


@dataclass
class IncidentFeatures:
    candidateCode: str
    prohibited: list[DomainVisit] = field(default_factory=list)
    unclassified: list[DomainVisit] = field(default_factory=list)
    permitted: list[DomainVisit] = field(default_factory=list)
    correlated: list[CorrelatedChange] = field(default_factory=list)
    coveragePercent: float = 0.0
    coverageWarning: bool = True
    extensionConnected: bool = False
    prohibitedStrength: float = 0.0
    correlatedStrength: float = 0.0
    repeatStrength: float = 0.0
    unclassifiedStrength: float = 0.0
    featureValues: dict[str, float] = field(default_factory=dict)


def normalize_domain(domain: str | None) -> str | None:
    if not domain:
        return None
    value = domain.strip().lower()
    value = re.sub(r"^[a-z][a-z0-9+.-]*://", "", value)
    value = value.split("/")[0].split("?")[0].split("#")[0]
    value = value.split(":")[0]
    if value.startswith("www."):
        value = value[4:]
    return value or None


def _matches(domain: str, pattern: str) -> tuple[bool, int]:
    pattern = pattern.strip().lower()
    if not pattern:
        return False, 0
    if pattern.startswith("re:"):
        try:
            return bool(re.search(pattern[3:], domain)), 1
        except re.error:
            return False, 0
    if pattern.startswith("*."):
        suffix = pattern[2:]
        return (domain == suffix or domain.endswith("." + suffix)), 2
    return (domain == pattern or domain.endswith("." + pattern)), 3


def classify_domain(domain: str | None, rules: list[Rule]) -> RuleHit:
    normalized = normalize_domain(domain)
    if not normalized:
        return RuleHit("UNCLASSIFIED", "", None)

    matches: list[tuple[int, int, RuleHit]] = []
    for index, rule in enumerate(rules):
        matched, specificity = _matches(normalized, rule.domainPattern)
        if matched:
            matches.append((specificity, -index, RuleHit(rule.category, rule.domainPattern, rule.note)))

    if not matches:
        return RuleHit("UNCLASSIFIED", "", None)
    matches.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return matches[0][2]


def _material_change(previous: str, current: str) -> tuple[bool, int]:
    ratio = SequenceMatcher(None, normalize(previous).lower(), normalize(current).lower()).ratio()
    delta = len(normalize(current)) - len(normalize(previous))
    return (ratio < 0.97 and (abs(delta) >= 15 or ratio < 0.90)), delta


def compute_incident(
    candidate: IncidentCandidate,
    rules: list[Rule],
    timing_window_seconds: int = 120,
    min_coverage_percent: float = 60.0,
) -> IncidentFeatures | None:
    features = IncidentFeatures(
        candidateCode=candidate.candidateCode,
        extensionConnected=candidate.extensionConnected,
    )

    for event in sorted(candidate.events, key=lambda e: e.occurredAt):
        if event.eventType not in VISIT_EVENTS:
            continue
        domain = normalize_domain(event.domain)
        if not domain:
            continue
        hit = classify_domain(domain, rules)
        visit = DomainVisit(domain, event.occurredAt, hit.category, hit.pattern or None, hit.note)
        if hit.category == "PROHIBITED":
            features.prohibited.append(visit)
        elif hit.category == "PERMITTED":
            features.permitted.append(visit)
        else:
            features.unclassified.append(visit)

    if not candidate.events or not candidate.extensionConnected:
        features.coveragePercent = 0.0
        features.coverageWarning = True
    else:
        features.coveragePercent = coverage_percent(
            candidate.events, candidate.monitoringStart, candidate.monitoringEnd
        )
        features.coverageWarning = features.coveragePercent < min_coverage_percent

    # Answer revisions that materially changed shortly after a prohibited visit.
    seen: set[tuple[int, int]] = set()
    for answer in candidate.answers:
        revisions = sorted(answer.revisions, key=lambda r: r.savedAt)
        for index in range(1, len(revisions)):
            previous, current = revisions[index - 1], revisions[index]
            material, delta = _material_change(previous.text, current.text)
            if not material:
                continue
            for visit in features.prohibited:
                delay = (current.savedAt - visit.occurredAt).total_seconds()
                if 0 <= delay <= timing_window_seconds:
                    key = (answer.questionId, current.revisionNo)
                    if key in seen:
                        continue
                    seen.add(key)
                    features.correlated.append(
                        CorrelatedChange(
                            questionId=answer.questionId,
                            revisionNo=current.revisionNo,
                            domain=visit.domain,
                            visitAt=visit.occurredAt,
                            savedAt=current.savedAt,
                            deltaSeconds=delay,
                            deltaChars=delta,
                        )
                    )

    if not features.prohibited and not features.unclassified and not features.correlated:
        return None

    features.prohibitedStrength = 1.0 - math.exp(-len(features.prohibited) / 2.0)
    features.correlatedStrength = 1.0 - math.exp(-len(features.correlated) / 1.5)
    distinct_prohibited = len({v.domain for v in features.prohibited})
    features.repeatStrength = min(1.0, distinct_prohibited / 3.0)
    features.unclassifiedStrength = 1.0 - math.exp(-len(features.unclassified) / 3.0)

    features.featureValues = {
        "prohibited": round(features.prohibitedStrength, 4),
        "correlated": round(features.correlatedStrength, 4),
        "repeat": round(features.repeatStrength, 4),
        "unclassified": round(features.unclassifiedStrength, 4),
        "coverage": round(features.coveragePercent / 100.0, 4),
        "extensionConnected": 1.0 if features.extensionConnected else 0.0,
    }
    return features
