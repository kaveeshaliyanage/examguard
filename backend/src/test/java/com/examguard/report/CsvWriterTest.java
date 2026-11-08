package com.examguard.report;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CsvWriterTest {

    @Test
    void neutralisesSpreadsheetFormulas() {
        assertEquals("'=SUM(A1)", CsvWriter.cell("=SUM(A1)"));
        assertEquals("'+1", CsvWriter.cell("+1"));
        assertEquals("'-1", CsvWriter.cell("-1"));
        assertEquals("'@cmd", CsvWriter.cell("@cmd"));
    }

    @Test
    void quotesSeparatorsAndQuotes() {
        assertEquals("\"a,b\"", CsvWriter.cell("a,b"));
        assertEquals("\"say \"\"hi\"\"\"", CsvWriter.cell("say \"hi\""));
        assertEquals("\"line\nbreak\"", CsvWriter.cell("line\nbreak"));
    }

    @Test
    void leavesPlainTextAlone() {
        assertEquals("C001", CsvWriter.cell("C001"));
        assertEquals("", CsvWriter.cell(null));
        assertEquals("", CsvWriter.cell(""));
    }

    @Test
    void buildsRowsAndDocuments() {
        assertEquals("a,2,\"x,y\"", CsvWriter.row("a", 2, "x,y"));
        assertEquals("a\r\nb\r\n", CsvWriter.document(java.util.List.of("a", "b")));
    }
}
