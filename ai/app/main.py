from __future__ import annotations

import logging

from fastapi import FastAPI

from .config import settings
from .features.semantic import status as semantic_status
from .schemas import (
    AnalysisResponse,
    AuthorshipRequest,
    AuthorshipResponse,
    HealthResponse,
    IncidentAnalysisRequest,
    PairAnalysisRequest,
)
from .services.analyzer import analyze_authorship, analyze_incidents, analyze_pairs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ExamGuard Analysis Service",
    version="0.1.0",
    description=(
        "Feature extraction and review-priority fusion. Scores are review priorities, "
        "not probabilities of misconduct. Pair, incident and authorship schemas are isolated. "
        "Authorship stylometry is a review aid and is capped at priority 54 (band MEDIUM)."
    ),
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="UP",
        modelVersion=settings.model_version,
        semanticAvailable=semantic_status() == "ready",
        authorshipAvailable=True,
        authorshipScoreCap=54.0,
    )


@app.get("/")
def root() -> dict:
    return {
        "service": "examguard-analysis",
        "modelVersion": settings.model_version,
        "endpoints": ["/health", "/analyze/pairs", "/analyze/incidents", "/analyze/authorship"],
        "scoreSemantics": "review priority 0-100, not a probability",
        "authorshipSemantics": (
            "stylometric review aid for machine-generated prose; capped at 54 (MEDIUM), "
            "not proof of AI use or of copying"
        ),
    }


@app.post("/analyze/pairs", response_model=AnalysisResponse)
def pairs(request: PairAnalysisRequest) -> AnalysisResponse:
    logger.info(
        "pair analysis exam=%s candidates=%s mode=%s",
        request.examId,
        len(request.candidates),
        request.modelVersion,
    )
    return analyze_pairs(request)


@app.post("/analyze/incidents", response_model=AnalysisResponse)
def incidents(request: IncidentAnalysisRequest) -> AnalysisResponse:
    logger.info(
        "incident analysis exam=%s candidates=%s mode=%s",
        request.examId,
        len(request.candidates),
        request.modelVersion,
    )
    return analyze_incidents(request)


@app.post("/analyze/authorship", response_model=AuthorshipResponse)
def authorship(request: AuthorshipRequest) -> AuthorshipResponse:
    logger.info(
        "authorship analysis exam=%s candidates=%s mode=%s",
        request.examId,
        len(request.candidates),
        request.modelVersion,
    )
    return analyze_authorship(request)
