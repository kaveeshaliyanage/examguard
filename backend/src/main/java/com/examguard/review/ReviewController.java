package com.examguard.review;

import com.examguard.analysis.FindingViewDtos.DecisionView;
import com.examguard.review.ReviewDtos.AuditView;
import com.examguard.review.ReviewDtos.DecisionRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @PostMapping("/findings/{findingId}/decisions")
    public DecisionView decide(
            Authentication authentication,
            @PathVariable Long findingId,
            @Valid @RequestBody DecisionRequest request) {
        return reviewService.decide(authentication, findingId, request);
    }

    @GetMapping("/exams/{examId}/audit")
    public List<AuditView> audit(Authentication authentication, @PathVariable Long examId) {
        return reviewService.audit(authentication, examId);
    }
}
