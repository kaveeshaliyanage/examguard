import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException

from .sandbox import TooBusy, execute
from .schemas import RunRequest, RunResponse

app = FastAPI(title="ExamGuard code runner", docs_url=None, redoc_url=None)


def require_token(x_runner_token: str | None = Header(default=None)) -> None:
    """Fail closed: an unconfigured token rejects every run instead of accepting unauthenticated work."""
    expected = os.environ.get("RUNNER_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="The runner token is not configured")
    if x_runner_token is None or not hmac.compare_digest(x_runner_token, expected):
        raise HTTPException(status_code=401, detail="Invalid runner token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP"}


@app.post("/run", response_model=RunResponse, dependencies=[Depends(require_token)])
def run(request: RunRequest) -> RunResponse:
    try:
        return execute(request)
    except TooBusy as busy:
        raise HTTPException(
            status_code=429, detail=str(busy), headers={"Retry-After": "5"}) from busy
