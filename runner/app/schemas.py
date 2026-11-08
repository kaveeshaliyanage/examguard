from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Language = Literal["PYTHON", "JAVASCRIPT", "JAVA"]


class TestCase(BaseModel):
    input: str = Field(default="", max_length=4000)
    expectedOutput: str = Field(max_length=4000)


class RunRequest(BaseModel):
    language: Language
    source: str = Field(max_length=20000)
    tests: list[TestCase] = Field(min_length=1, max_length=20)
    timeLimitMs: int = Field(default=2000, ge=200, le=5000)


class TestResult(BaseModel):
    index: int
    passed: bool
    status: str
    durationMs: int
    message: str = ""


class RunResponse(BaseModel):
    compileError: str | None = None
    tests: list[TestResult]
