package com.examguard.exam;

import com.examguard.exam.ExamDtos.AttemptSummary;
import com.examguard.exam.ExamDtos.CreateExamRequest;
import com.examguard.exam.ExamDtos.ExamDetail;
import com.examguard.exam.ExamDtos.ExamSummary;
import com.examguard.exam.ExamDtos.PermissionRequest;
import com.examguard.exam.ExamDtos.PermissionView;
import com.examguard.exam.ExamDtos.StatusRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/exams")
public class ExamController {

    private final ExamService examService;

    public ExamController(ExamService examService) {
        this.examService = examService;
    }

    @GetMapping
    public List<ExamSummary> list(Authentication authentication) {
        return examService.list(authentication);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ExamDetail create(Authentication authentication,
                             @Valid @RequestBody CreateExamRequest request) {
        return examService.create(authentication, request);
    }

    @GetMapping("/{examId}")
    public ExamDetail detail(Authentication authentication, @PathVariable Long examId) {
        return examService.detail(authentication, examId);
    }

    @PatchMapping("/{examId}/status")
    public ExamDetail updateStatus(Authentication authentication,
                                   @PathVariable Long examId,
                                   @Valid @RequestBody StatusRequest request) {
        return examService.updateStatus(authentication, examId, request.status());
    }

    @GetMapping("/{examId}/attempts")
    public List<AttemptSummary> attempts(Authentication authentication, @PathVariable Long examId) {
        return examService.attempts(authentication, examId);
    }

    @GetMapping("/{examId}/permissions")
    public List<PermissionView> permissions(Authentication authentication, @PathVariable Long examId) {
        return examService.permissions(authentication, examId);
    }

    @PostMapping("/{examId}/permissions")
    public PermissionView addPermission(Authentication authentication,
                                        @PathVariable Long examId,
                                        @Valid @RequestBody PermissionRequest request) {
        return examService.addPermission(authentication, examId, request);
    }

    @DeleteMapping("/{examId}/permissions/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removePermission(Authentication authentication,
                                 @PathVariable Long examId,
                                 @PathVariable Long userId) {
        examService.removePermission(authentication, examId, userId);
    }
}
