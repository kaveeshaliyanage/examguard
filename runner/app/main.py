from fastapi import FastAPI

from .sandbox import execute
from .schemas import RunRequest, RunResponse

app = FastAPI(title="ExamGuard code runner", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP"}


@app.post("/run", response_model=RunResponse)
def run(request: RunRequest) -> RunResponse:
    return execute(request)
