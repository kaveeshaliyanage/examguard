package com.examguard.grading;

import com.examguard.grading.GradingDtos.GradeRequest;
import com.examguard.grading.GradingDtos.GradeResponse;
import com.examguard.grading.GradingDtos.GradingRow;
import com.examguard.grading.GradingDtos.ReleaseResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class GradingController {

    private final GradingService gradingService;

    public GradingController(GradingService gradingService) {
        this.gradingService = gradingService;
    }

    @GetMapping("/api/exams/{examId}/grading")
    public List<GradingRow> grading(Authentication authentication, @PathVariable Long examId) {
        return gradingService.gradingRows(authentication, examId);
    }

    @PutMapping("/api/attempts/{attemptId}/answers/{questionId}/grade")
    public GradeResponse grade(Authentication authentication,
                               @PathVariable Long attemptId,
                               @PathVariable Long questionId,
                               @Valid @RequestBody GradeRequest request) {
        return gradingService.grade(authentication, attemptId, questionId, request);
    }

    @PostMapping("/api/exams/{examId}/grades/release")
    public ReleaseResponse release(Authentication authentication, @PathVariable Long examId) {
        return gradingService.release(authentication, examId);
    }
}
