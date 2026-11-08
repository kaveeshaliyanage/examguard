package com.examguard.exam;

import com.examguard.exam.ExamDtos.AttemptSummary;
import com.examguard.exam.ExamDtos.CreateExamRequest;
import com.examguard.exam.ExamDtos.ExamDetail;
import com.examguard.exam.ExamDtos.ExamSummary;
import com.examguard.exam.ExamDtos.PermissionRequest;
import com.examguard.exam.ExamDtos.PermissionView;
import com.examguard.exam.ExamDtos.QuestionPayload;
import com.examguard.exam.ExamDtos.ReorderRequest;
import com.examguard.exam.ExamDtos.RosterEntryRequest;
import com.examguard.exam.ExamDtos.RosterEntryView;
import com.examguard.exam.ExamDtos.StaffQuestionView;
import com.examguard.exam.ExamDtos.StatusRequest;
import com.examguard.exam.ExamDtos.UpdateExamRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/exams")
public class ExamController {

    private final ExamService examService;
    private final QuestionService questionService;

    public ExamController(ExamService examService, QuestionService questionService) {
        this.examService = examService;
        this.questionService = questionService;
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

    @PatchMapping("/{examId}")
    public ExamDetail updateSettings(Authentication authentication,
                                     @PathVariable Long examId,
                                     @Valid @RequestBody UpdateExamRequest request) {
        return examService.updateSettings(authentication, examId, request);
    }

    @GetMapping("/{examId}/roster")
    public List<RosterEntryView> roster(Authentication authentication, @PathVariable Long examId) {
        return examService.roster(authentication, examId);
    }

    @PostMapping("/{examId}/roster")
    @ResponseStatus(HttpStatus.CREATED)
    public RosterEntryView addRosterEntry(Authentication authentication,
                                          @PathVariable Long examId,
                                          @Valid @RequestBody RosterEntryRequest request) {
        return examService.addRosterEntry(authentication, examId, request.email());
    }

    @DeleteMapping("/{examId}/roster/{entryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeRosterEntry(Authentication authentication,
                                  @PathVariable Long examId,
                                  @PathVariable Long entryId) {
        examService.removeRosterEntry(authentication, examId, entryId);
    }

    @GetMapping("/{examId}/attempts")
    public List<AttemptSummary> attempts(Authentication authentication, @PathVariable Long examId) {
        return examService.attempts(authentication, examId);
    }

    @PostMapping("/{examId}/questions")
    @ResponseStatus(HttpStatus.CREATED)
    public StaffQuestionView createQuestion(Authentication authentication,
                                            @PathVariable Long examId,
                                            @Valid @RequestBody QuestionPayload request) {
        return questionService.create(authentication, examId, request);
    }

    @PutMapping("/{examId}/questions/{questionId}")
    public StaffQuestionView updateQuestion(Authentication authentication,
                                            @PathVariable Long examId,
                                            @PathVariable Long questionId,
                                            @Valid @RequestBody QuestionPayload request) {
        return questionService.update(authentication, examId, questionId, request);
    }

    @DeleteMapping("/{examId}/questions/{questionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteQuestion(Authentication authentication,
                               @PathVariable Long examId,
                               @PathVariable Long questionId) {
        questionService.delete(authentication, examId, questionId);
    }

    @PutMapping("/{examId}/questions/reorder")
    public List<StaffQuestionView> reorderQuestions(Authentication authentication,
                                                    @PathVariable Long examId,
                                                    @Valid @RequestBody ReorderRequest request) {
        return questionService.reorder(authentication, examId, request.questionIds());
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
