package com.examguard.report;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class PdfRendererTest {

    @Autowired
    private PdfRenderer renderer;

    @Test
    void rendersPdfWithBundledFonts() throws Exception {
        byte[] pdf = renderer.render("reports/test-page", Map.of(
                "title", "ExamGuard report",
                "body", "Rendered from a template with the bundled Noto Sans family.",
                "code", "C001-Q3"));

        assertEquals("%PDF", new String(pdf, 0, 4, StandardCharsets.ISO_8859_1));
        assertTrue(pdf.length > 1_000, "PDF should contain a rendered page");

        try (PDDocument document = PDDocument.load(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("ExamGuard report"), "text should be extractable: " + text);
            assertTrue(text.contains("C001-Q3"));
        }
    }
}
