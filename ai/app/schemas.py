from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    """Reject unknown fields. This is what prevents accidental pair/activity contamination."""

    model_config = ConfigDict(extra="forbid")


# --- shared -----------------------------------------------------------------


class Question(StrictModel):
    id: int
    prompt: str


class Revision(StrictModel):
    revisionNo: int
    text: str = ""
    savedAt: datetime


class Answer(StrictModel):
    questionId: int
    text: str = ""
    revisions: list[Revision] = Field(default_factory=list)


class Evidence(StrictModel):
    source: Literal[
        "SIMILARITY", "PATTERN", "TIMING", "ACTIVITY", "ANSWER_CHANGE", "COVERAGE", "AUTHORSHIP"
    ]
    weight: float = 0.0
    questionId: int | None = None
    detail: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class Finding(StrictModel):
    type: Literal["CANDIDATE_PAIR", "CANDIDATE_INCIDENT"]
    candidateA: str
    candidateB: str | None = None
    questionId: int | None = None
    priorityScore: float = Field(ge=0.0, le=100.0)
    priorityBand: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    summary: str
    coverageWarning: bool = False
    evidence: list[Evidence] = Field(default_factory=list)


class AnalysisResponse(StrictModel):
    modelVersion: str
    findings: list[Finding] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)


# --- pair analysis ----------------------------------------------------------


class PairCandidate(StrictModel):
    candidateCode: str
    attemptId: int | None = None
    answers: list[Answer] = Field(default_factory=list)


class PairConfig(StrictModel):
    minAnswerChars: int = 20
    similarityThreshold: float = 0.5
    rareDfMax: int = 3
    timingWindowSeconds: int = 120
    maxFindings: int = 500


class PairAnalysisRequest(StrictModel):
    examId: int
    modelVersion: str = "rules-1.0"
    questions: list[Question]
    candidates: list[PairCandidate]
    config: PairConfig = Field(default_factory=PairConfig)


# --- incident analysis ------------------------------------------------------


class Event(StrictModel):
    eventType: str
    domain: str | None = None
    occurredAt: datetime
    receivedAt: datetime | None = None
    tabId: int | None = None


class Rule(StrictModel):
    category: Literal["PERMITTED", "PROHIBITED", "UNCLASSIFIED"]
    domainPattern: str
    note: str | None = None


class IncidentCandidate(StrictModel):
    candidateCode: str
    attemptId: int | None = None
    answers: list[Answer] = Field(default_factory=list)
    events: list[Event] = Field(default_factory=list)
    monitoringStart: datetime
    monitoringEnd: datetime
    examDurationMinutes: int
    extensionConnected: bool = False


class IncidentConfig(StrictModel):
    timingWindowSeconds: int = 120
    minCoveragePercent: float = 60.0
    maxFindings: int = 500


class IncidentAnalysisRequest(StrictModel):
    examId: int
    modelVersion: str = "rules-1.0"
    candidates: list[IncidentCandidate]
    rules: list[Rule] = Field(default_factory=list)
    config: IncidentConfig = Field(default_factory=IncidentConfig)


# --- authorship analysis ----------------------------------------------------
#
# An authorship request is deliberately single-cohort: one request describes the answers of
# one candidate. A request that repeats a candidate code is rejected instead of silently
# merging two candidates into one stylometric profile.


class AuthorshipRevision(StrictModel):
    revisionNo: int
    text: str = ""
    savedAt: datetime
    wordCount: int | None = None


class AuthorshipAnswer(StrictModel):
    questionId: int
    text: str = ""
    revisions: list[AuthorshipRevision] = Field(default_factory=list)


class AuthorshipCandidate(StrictModel):
    candidateCode: str
    attemptId: int | None = None
    answers: list[AuthorshipAnswer] = Field(default_factory=list)


class AuthorshipConfig(StrictModel):
    minAnswerChars: int = 200
    maxFindings: int = 200


class AuthorshipRequest(StrictModel):
    examId: int
    modelVersion: str = "rules-1.0"
    candidates: list[AuthorshipCandidate]
    config: AuthorshipConfig = Field(default_factory=AuthorshipConfig)

    @model_validator(mode="after")
    def _reject_duplicate_candidates(self) -> "AuthorshipRequest":
        codes = [candidate.candidateCode for candidate in self.candidates]
        duplicates = sorted({code for code in codes if codes.count(code) > 1})
        if duplicates:
            raise ValueError(
                f"authorship request repeats candidate code(s): {', '.join(duplicates)}"
            )
        return self


class AuthorshipFinding(StrictModel):
    candidateCode: str
    questionId: int
    priorityScore: float = Field(ge=0.0, le=100.0)
    priorityBand: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    probability: float = Field(ge=0.0, le=1.0)
    summary: str
    features: dict[str, float] = Field(default_factory=dict)
    evidence: list[Evidence] = Field(default_factory=list)


class AuthorshipResponse(StrictModel):
    modelVersion: str
    findings: list[AuthorshipFinding] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    modelVersion: str
    semanticAvailable: bool
    authorshipAvailable: bool = True
    authorshipScoreCap: float = 54.0
