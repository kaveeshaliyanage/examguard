"""Runs one candidate submission against its test cases.

Isolation is layered: the container has no network, a read-only filesystem and a small tmpfs;
each process gets its own session, rlimits, wall-clock timeout and truncated output. The service
must only ever be deployed behind the internal compose network.
"""

from __future__ import annotations

import os
import resource
import signal
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from .schemas import RunRequest, RunResponse, TestCase, TestResult

MAX_OUTPUT_BYTES = 8192
COMPILE_TIMEOUT_SECONDS = 20
# Stays below the backend client's 90 s read timeout so a slow run never looks like an outage.
MAX_TOTAL_SECONDS = 75
MESSAGE_CHARS = 600

_SOURCE_FILES = {"PYTHON": "solution.py", "JAVASCRIPT": "solution.js", "JAVA": "Main.java"}
# RLIMIT_AS only for CPython. Node and the JVM reserve far more virtual address space than
# they ever touch, so an address-space cap kills them at startup; they get a heap cap instead.
_MEMORY_LIMITS = {"PYTHON": 256 * 1024 * 1024, "JAVASCRIPT": None, "JAVA": None}

_slots = threading.BoundedSemaphore(int(os.environ.get("MAX_CONCURRENCY", "2")))


class TooBusy(RuntimeError):
    """Raised when every execution slot is taken; the caller should retry later."""


@dataclass
class _Outcome:
    exit_code: int
    stdout: bytes
    stderr: bytes
    timed_out: bool


def _rlimits(memory_bytes: int | None, cpu_seconds: int):
    def apply() -> None:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_FSIZE, (1 << 20, 1 << 20))
        resource.setrlimit(resource.RLIMIT_NPROC, (256, 256))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        if memory_bytes:
            resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))

    return apply


def _environment() -> dict[str, str]:
    return {
        "PATH": "/usr/local/bin:/usr/local/sbin:/usr/bin:/bin",
        "HOME": "/tmp",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONIOENCODING": "utf-8",
        "NODE_OPTIONS": "",
        "OPENBLAS_NUM_THREADS": "1",
        "OMP_NUM_THREADS": "1",
    }


def _run(command: list[str], workdir: Path, stdin_text: str, timeout_seconds: float,
         memory_bytes: int | None) -> _Outcome:
    process = subprocess.Popen(
        command,
        cwd=workdir,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=_environment(),
        preexec_fn=_rlimits(memory_bytes, int(timeout_seconds) + 2),
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(
            input=stdin_text.encode("utf-8"), timeout=timeout_seconds)
        return _Outcome(process.returncode, stdout[:MAX_OUTPUT_BYTES], stderr[:MAX_OUTPUT_BYTES], False)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout, stderr = process.communicate()
        return _Outcome(-signal.SIGKILL, stdout[:MAX_OUTPUT_BYTES], stderr[:MAX_OUTPUT_BYTES], True)


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n")).strip("\n")


def _tail(data: bytes) -> str:
    text = data.decode("utf-8", errors="replace").strip()
    return text[-MESSAGE_CHARS:]


def execute(request: RunRequest) -> RunResponse:
    if not _slots.acquire(blocking=False):
        raise TooBusy("The code runner is busy. Retry shortly.")
    try:
        with tempfile.TemporaryDirectory(prefix="examguard-", dir="/tmp") as directory:
            return _execute_in(request, Path(directory))
    finally:
        _slots.release()


def _execute_in(request: RunRequest, workdir: Path) -> RunResponse:
    deadline = time.monotonic() + MAX_TOTAL_SECONDS
    source_file = _SOURCE_FILES[request.language]
    (workdir / source_file).write_text(request.source, encoding="utf-8")

    command = _command(request.language)
    if request.language == "JAVA":
        compile_budget = max(1.0, min(COMPILE_TIMEOUT_SECONDS, deadline - time.monotonic()))
        compile_result = _run(
            ["javac", "-encoding", "UTF-8", "-J-Xmx256m", source_file],
            workdir, "", compile_budget, None)
        if compile_result.exit_code != 0:
            message = _tail(compile_result.stderr) or "Compilation failed."
            return RunResponse(
                compileError=message,
                tests=[
                    TestResult(index=index, passed=False, status="COMPILE_ERROR",
                               durationMs=0, message="The code did not compile.")
                    for index in range(len(request.tests))
                ],
            )

    results: list[TestResult] = []
    timeout_seconds = request.timeLimitMs / 1000
    for index, case in enumerate(request.tests):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            results.append(TestResult(index=index, passed=False, status="NOT_RUN",
                                      durationMs=0, message="The run exceeded its total time budget."))
            continue
        started = time.monotonic()
        outcome = _run(command, workdir, case.input, min(timeout_seconds, remaining),
                       _MEMORY_LIMITS[request.language])
        duration_ms = int((time.monotonic() - started) * 1000)
        results.append(_result(index, case, outcome, duration_ms))
    return RunResponse(tests=results)


def _command(language: str) -> list[str]:
    if language == "PYTHON":
        return ["python3", "-I", "solution.py"]
    if language == "JAVASCRIPT":
        return ["node", "--max-old-space-size=128", "solution.js"]
    return ["java", "-Xmx128m", "-XX:+UseSerialGC", "-cp", ".", "Main"]


def _result(index: int, case: TestCase, outcome: _Outcome, duration_ms: int) -> TestResult:
    if outcome.timed_out:
        return TestResult(index=index, passed=False, status="TIMEOUT", durationMs=duration_ms,
                          message="The program did not finish within the time limit.")
    if outcome.exit_code < 0:
        return TestResult(index=index, passed=False, status="LIMIT_EXCEEDED", durationMs=duration_ms,
                          message="The program was stopped after exceeding a resource limit.")
    if outcome.exit_code != 0:
        detail = _tail(outcome.stderr) or f"Process exited with code {outcome.exit_code}."
        return TestResult(index=index, passed=False, status="RUNTIME_ERROR", durationMs=duration_ms,
                          message=detail)
    matches = _normalize(outcome.stdout.decode("utf-8", errors="replace")) == _normalize(
        case.expectedOutput)
    return TestResult(index=index, passed=matches, status="PASSED" if matches else "FAILED",
                      durationMs=duration_ms, message="" if matches else "Output did not match.")
