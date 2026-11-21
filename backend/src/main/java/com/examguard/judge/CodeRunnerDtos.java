package com.examguard.judge;

import java.util.List;

public final class CodeRunnerDtos {

    private CodeRunnerDtos() {
    }

    public record RunnerTest(String input, String expectedOutput) {
    }

    public record RunnerRequest(String language, String source, List<RunnerTest> tests, int timeLimitMs) {
    }

    public record RunnerTestResult(int index, boolean passed, String status, long durationMs,
                                   String message) {
    }

    public record RunnerResponse(String compileError, List<RunnerTestResult> tests) {
    }

    public record CodeTestResult(String name, boolean passed, String status, boolean hidden,
                                 long durationMs) {
    }

    public record CodeGradeDetail(String language, int passed, int total, List<CodeTestResult> tests) {
    }

    public record CodeJudgeSummary(int attemptsJudged, int questionsJudged) {
    }
}
