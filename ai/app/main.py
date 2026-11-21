from __future__ import annotations

import hmac
import logging
import os

from fastapi import Depends, FastAPI, Header, HTTPException

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
    # A public deployment sets ANALYSIS_TOKEN; it then has no reason to publish its API docs.
    docs_url=None if os.environ.get("ANALYSIS_TOKEN") else "/docs",
    redoc_url=None if os.environ.get("ANALYSIS_TOKEN") else "/redoc",
    openapi_url=None if os.environ.get("ANALYSIS_TOKEN") else "/openapi.json",
)


def require_token(x_analysis_token: str | None = Header(default=None)) -> None:
    """Enforce the shared backend secret whenever ANALYSIS_TOKEN is configured.

    Compose keeps the service on a private network and leaves the token unset. A deployment that
    exposes the service publicly (Render's free plan has no private services) must set it on both
    the backend and this service.
    """
    expected = os.environ.get("ANALYSIS_TOKEN")
    if not expected:
        return
    if x_analysis_token is None or not hmac.compare_digest(x_analysis_token, expected):
        raise HTTPException(status_code=401, detail="Invalid analysis token")


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


@app.post("/analyze/pairs", response_model=AnalysisResponse, dependencies=[Depends(require_token)])
def pairs(request: PairAnalysisRequest) -> AnalysisResponse:
    logger.info(
        "pair analysis exam=%s candidates=%s mode=%s",
        request.examId,
        len(request.candidates),
        request.modelVersion,
    )
    return analyze_pairs(request)


@app.post("/analyze/incidents", response_model=AnalysisResponse, dependencies=[Depends(require_token)])
def incidents(request: IncidentAnalysisRequest) -> AnalysisResponse:
    logger.info(
        "incident analysis exam=%s candidates=%s mode=%s",
        request.examId,
        len(request.candidates),
        request.modelVersion,
    )
    return analyze_incidents(request)


@app.post("/analyze/authorship", response_model=AuthorshipResponse, dependencies=[Depends(require_token)])
def authorship(request: AuthorshipRequest) -> AuthorshipResponse:
    logger.info(
        "authorship analysis exam=%s candidates=%s mode=%s",
        request.examId,
        len(request.candidates),
        request.modelVersion,
    )
    return analyze_authorship(request)
