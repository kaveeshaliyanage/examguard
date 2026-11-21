package com.examguard.report;

import java.util.List;
import java.util.stream.Collectors;

/** CSV output with spreadsheet-formula neutralisation for untrusted cell text. */
public final class CsvWriter {

    private CsvWriter() {
    }

    public static String row(Object... cells) {
        return java.util.Arrays.stream(cells)
                .map(value -> cell(value == null ? null : value.toString()))
                .collect(Collectors.joining(","));
    }

    public static String document(List<String> rows) {
        return String.join("\r\n", rows) + "\r\n";
    }

    static String cell(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        String safe = value;
        char first = safe.charAt(0);
        if (first == '=' || first == '+' || first == '-' || first == '@' || first == '\t' || first == '\r') {
            safe = "'" + safe;
        }
        if (safe.indexOf(',') >= 0 || safe.indexOf('"') >= 0
                || safe.indexOf('\n') >= 0 || safe.indexOf('\r') >= 0) {
            return '"' + safe.replace("\"", "\"\"") + '"';
        }
        return safe;
    }
}
