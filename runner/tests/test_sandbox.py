"""Behavioural tests for the sandbox. They must run inside the runner image:

    docker build -t examguard-runner ./runner
    docker run --rm examguard-runner-test python -m pytest tests -q
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sandbox import execute
from app.schemas import RunRequest, TestCase as Case


def run(language: str, source: str, tests: list[tuple[str, str]], time_limit_ms: int = 2000):
    return execute(
        RunRequest(
            language=language,
            source=source,
            tests=[Case(input=stdin, expectedOutput=expected) for stdin, expected in tests],
            timeLimitMs=time_limit_ms,
        )
    )


def statuses(response) -> list[str]:
    return [result.status for result in response.tests]


PYTHON_ECHO = """
import sys
data = sys.stdin.read().strip()
print(int(data) * 2)
"""

PYTHON_SUM = """
import sys
values = [int(part) for part in sys.stdin.read().split()]
print(sum(values))
"""


def test_python_passes_every_case():
    response = run("PYTHON", PYTHON_ECHO, [("2", "4"), ("21", "42")])

    assert response.compileError is None
    assert statuses(response) == ["PASSED", "PASSED"]
    assert all(result.passed for result in response.tests)


def test_python_reports_wrong_output_without_leaking_the_expected_value():
    response = run("PYTHON", "print('nope')", [("", "the-secret-answer")])

    assert statuses(response) == ["FAILED"]
    assert response.tests[0].passed is False
    assert "the-secret-answer" not in response.tests[0].message


def test_python_syntax_error_is_a_runtime_error_with_a_message():
    response = run("PYTHON", "def broken(:\n    pass\n", [("", "x")])

    assert statuses(response) == ["RUNTIME_ERROR"]
    assert response.tests[0].message


def test_python_stdin_is_split_across_cases():
    response = run("PYTHON", PYTHON_SUM, [("1 2 3", "6"), ("10 20", "30")])

    assert statuses(response) == ["PASSED", "PASSED"]


def test_infinite_loop_times_out_and_the_rest_still_runs():
    source = "while True:\n    pass\n"
    response = run("PYTHON", source, [("", "x"), ("", "x")], time_limit_ms=300)

    assert statuses(response) == ["TIMEOUT", "TIMEOUT"]
    assert "time limit" in response.tests[0].message


def test_memory_hog_is_limited():
    source = "block = bytearray(1024 * 1024 * 1024)\nprint(len(block))\n"
    response = run("PYTHON", source, [("", "1073741824")])

    assert statuses(response)[0] in {"RUNTIME_ERROR", "LIMIT_EXCEEDED"}
    assert response.tests[0].passed is False


def test_trailing_whitespace_and_line_endings_do_not_fail_a_case():
    source = "print('alpha')\nprint('beta')\n"
    response = run("PYTHON", source, [("", "alpha   \r\nbeta\r\n\r\n")])

    assert statuses(response) == ["PASSED"]


def test_large_output_is_truncated_instead_of_crashing_the_runner():
    source = "print('x' * 200000)\n"
    response = run("PYTHON", source, [("", "x")])

    assert statuses(response) == ["FAILED"]
    assert len(response.tests[0].message) <= 600


def test_javascript_passes_and_fails():
    source = (
        "const chunks = [];"
        "process.stdin.on('data', (chunk) => chunks.push(chunk));"
        "process.stdin.on('end', () =>"
        "  console.log(Buffer.concat(chunks).toString().trim().toUpperCase()));"
    )

    passed = run("JAVASCRIPT", source, [("abc", "ABC")])
    failed = run("JAVASCRIPT", source, [("abc", "xyz")])

    assert statuses(passed) == ["PASSED"]
    assert statuses(failed) == ["FAILED"]


def test_javascript_infinite_loop_times_out():
    response = run("JAVASCRIPT", "while (true) {}", [("", "x")], time_limit_ms=300)

    assert statuses(response) == ["TIMEOUT"]


JAVA_SOURCE = """
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        int total = 0;
        while (scanner.hasNextInt()) {
            total += scanner.nextInt();
        }
        System.out.println(total);
    }
}
"""


def test_java_compiles_once_and_runs_every_case():
    response = run("JAVA", JAVA_SOURCE, [("1 2 3", "6"), ("7", "7")])

    assert response.compileError is None
    assert statuses(response) == ["PASSED", "PASSED"]


@pytest.mark.parametrize(
    "language,stand_in",
    [
        ("PYTHON", "class Unclosed(:\n    pass\n"),
        ("JAVA", "public class Main { this is not java }\n"),
        ("JAVASCRIPT", "try { JSON.parse('{') } catch (e) { process.exit(1) }\n"),
    ],
)
def test_broken_programs_never_crash_the_service(language, stand_in):
    response = run(language, stand_in, [("", "x")])

    assert response.tests[0].passed is False
    assert response.tests[0].status in {"COMPILE_ERROR", "RUNTIME_ERROR", "FAILED"}


def test_java_compile_error_marks_every_case():
    response = run("JAVA", "public class Main { syntax error }", [("", "1"), ("", "2")])

    assert response.compileError
    assert statuses(response) == ["COMPILE_ERROR", "COMPILE_ERROR"]
    assert all(result.passed is False for result in response.tests)


client = TestClient(app)


def test_health_endpoint_answers_up():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "UP"}


def test_run_endpoint_rejects_an_empty_test_list():
    response = client.post(
        "/run", json={"language": "PYTHON", "source": "print(1)", "tests": []}
    )

    assert response.status_code == 422


def test_run_endpoint_rejects_unknown_language_and_oversized_source():
    unknown = client.post(
        "/run",
        json={"language": "RUBY", "source": "puts 1", "tests": [{"expectedOutput": "1"}]},
    )
    oversized = client.post(
        "/run",
        json={
            "language": "PYTHON",
            "source": "x" * 20001,
            "tests": [{"expectedOutput": "1"}],
        },
    )

    assert unknown.status_code == 422
    assert oversized.status_code == 422


def test_run_endpoint_returns_results_over_http():
    response = client.post(
        "/run",
        json={
            "language": "PYTHON",
            "source": "print(int(input()) + 1)",
            "tests": [{"input": "41", "expectedOutput": "42"}],
            "timeLimitMs": 1000,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["compileError"] is None
    assert payload["tests"][0]["status"] == "PASSED"
