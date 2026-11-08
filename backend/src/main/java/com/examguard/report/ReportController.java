package com.examguard.report;

import com.examguard.report.ReportDtos.AdminOverview;
import com.examguard.report.ReportDtos.AttemptReport;
import com.examguard.report.ReportDtos.ExamReport;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/attempts/{attemptId}")
    public AttemptReport attempt(Authentication authentication, @PathVariable Long attemptId) {
        return reportService.attemptReport(authentication, attemptId);
    }

    @GetMapping("/attempts/{attemptId}/pdf")
    public ResponseEntity<byte[]> attemptPdf(Authentication authentication, @PathVariable Long attemptId) {
        return attachment(reportService.attemptPdf(authentication, attemptId),
                "examguard-attempt-" + attemptId + ".pdf");
    }

    @GetMapping("/exams/{examId}")
    public ExamReport exam(Authentication authentication, @PathVariable Long examId) {
        return reportService.examReport(authentication, examId);
    }

    @GetMapping("/exams/{examId}/pdf")
    public ResponseEntity<byte[]> examPdf(Authentication authentication, @PathVariable Long examId) {
        return attachment(reportService.examPdf(authentication, examId),
                "examguard-exam-" + examId + ".pdf");
    }

    @GetMapping("/exams/{examId}/csv")
    public ResponseEntity<byte[]> examCsv(Authentication authentication, @PathVariable Long examId) {
        byte[] body = reportService.examCsv(authentication, examId).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("examguard-exam-" + examId + ".csv")
                        .build()
                        .toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body);
    }

    @GetMapping("/admin/overview")
    public AdminOverview adminOverview(Authentication authentication) {
        return reportService.adminOverview(authentication);
    }

    @GetMapping("/admin/overview/pdf")
    public ResponseEntity<byte[]> adminPdf(Authentication authentication) {
        return attachment(reportService.adminPdf(authentication), "examguard-overview.pdf");
    }

    private static ResponseEntity<byte[]> attachment(byte[] body, String filename) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename)
                        .build()
                        .toString())
                .contentType(MediaType.APPLICATION_PDF)
                .body(body);
    }
}
