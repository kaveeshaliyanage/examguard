"""Evidence items for one candidate's incident finding."""

from __future__ import annotations

from collections import Counter

from ..features.fusion import FusionResult
from ..schemas import Evidence


def incident_evidence(
    features, fusion: FusionResult, min_coverage_percent: float
) -> list[Evidence]:
    evidence: list[Evidence] = []

    if features.prohibited:
        domains = Counter(v.domain for v in features.prohibited)
        evidence.append(
            Evidence(
                source="ACTIVITY",
                weight=fusion.contributions.get("prohibited", 0.0),
                detail=(
                    f"{len(features.prohibited)} visit(s) to prohibited domain(s): "
                    + ", ".join(f"{domain} ({count})" for domain, count in domains.items())
                    + ". A visit is a rule deviation to review, not a determination."
                ),
                metadata={
                    "visits": [
                        {
                            "domain": v.domain,
                            "occurredAt": v.occurredAt.isoformat(),
                            "rule": v.pattern,
                            "note": v.note,
                        }
                        for v in features.prohibited
                    ]
                },
            )
        )

    if features.correlated:
        changes = "; ".join(
            f"Q{c.questionId} revision {c.revisionNo} saved {c.deltaSeconds:.0f}s after "
            f"{c.domain} ({c.deltaChars:+d} characters)"
            for c in features.correlated[:3]
        )
        evidence.append(
            Evidence(
                source="ANSWER_CHANGE",
                weight=fusion.contributions.get("correlated", 0.0),
                questionId=features.correlated[0].questionId,
                detail=f"Answer changes followed flagged visits: {changes}.",
                metadata={
                    "changes": [
                        {
                            "questionId": c.questionId,
                            "revisionNo": c.revisionNo,
                            "domain": c.domain,
                            "deltaSeconds": round(c.deltaSeconds, 1),
                            "deltaChars": c.deltaChars,
                        }
                        for c in features.correlated
                    ]
                },
            )
        )

    distinct = {v.domain for v in features.prohibited}
    if len(distinct) > 1 and fusion.contributions.get("repeat", 0.0) > 0:
        evidence.append(
            Evidence(
                source="PATTERN",
                weight=fusion.contributions.get("repeat", 0.0),
                detail=f"Repeated access across {len(distinct)} distinct prohibited domains.",
                metadata={"domains": sorted(distinct)},
            )
        )

    if features.unclassified:
        domains = Counter(v.domain for v in features.unclassified)
        evidence.append(
            Evidence(
                source="ACTIVITY",
                weight=fusion.contributions.get("unclassified", 0.0),
                detail=(
                    "Unclassified domain(s) observed: "
                    + ", ".join(f"{domain} ({count})" for domain, count in domains.items())
                    + ". These are not prohibited by the configured rules; confirm the rule set."
                ),
                metadata={
                    "visits": [
                        {
                            "domain": v.domain,
                            "occurredAt": v.occurredAt.isoformat(),
                        }
                        for v in features.unclassified
                    ]
                },
            )
        )

    if features.permitted:
        domains = sorted({v.domain for v in features.permitted})
        evidence.append(
            Evidence(
                source="ACTIVITY",
                weight=0.0,
                detail="Permitted resources were also observed: " + ", ".join(domains) + ".",
                metadata={"domains": domains},
            )
        )

    if features.coverageWarning:
        evidence.append(
            Evidence(
                source="COVERAGE",
                weight=0.0,
                detail=(
                    f"Monitoring coverage is {features.coveragePercent:.1f}% "
                    f"(minimum {min_coverage_percent:.0f}% expected). Missing observations are "
                    "unknown, not clean; priority is capped."
                ),
                metadata={
                    "coveragePercent": features.coveragePercent,
                    "extensionConnected": features.extensionConnected,
                    "eventCount": len(features.prohibited)
                    + len(features.unclassified)
                    + len(features.permitted),
                },
            )
        )

    evidence.sort(key=lambda e: e.weight, reverse=True)
    return evidence


def incident_summary(features, only_unclassified: bool) -> str:
    if only_unclassified:
        return (
            "Unclassified domain(s) were observed but no prohibited visit or correlated answer "
            "change. Confirm the exam's resource rules before drawing conclusions."
        )
    parts = []
    if features.prohibited:
        distinct = len({v.domain for v in features.prohibited})
        parts.append(
            f"{len(features.prohibited)} prohibited-domain visit(s) across {distinct} domain(s)"
        )
    if features.correlated:
        parts.append(f"{len(features.correlated)} answer change(s) followed a visit")
    if features.coverageWarning:
        parts.append(f"monitoring coverage is only {features.coveragePercent:.1f}%")
    return "; ".join(parts) + ". Resource-policy evidence only; review the timeline and rule set."
