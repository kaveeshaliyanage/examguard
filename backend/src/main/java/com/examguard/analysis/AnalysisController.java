package com.examguard.analysis;

import com.examguard.analysis.FindingViewDtos.AnalysisRunView;
import com.examguard.analysis.FindingViewDtos.FindingSummary;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.FindingType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/exams/{examId}")
public class AnalysisController {

    private final AnalysisService analysisService;
    private final FindingQueryService findingQueryService;

    public AnalysisController(AnalysisService analysisService, FindingQueryService findingQueryService) {
        this.analysisService = analysisService;
        this.findingQueryService = findingQueryService;
    }

    @PostMapping("/analysis-runs")
    public AnalysisRunView run(Authentication authentication, @PathVariable Long examId) {
        return analysisService.run(authentication, examId);
    }

    @GetMapping("/analysis-runs")
    public List<AnalysisRunView> runs(Authentication authentication, @PathVariable Long examId) {
        return analysisService.listRuns(authentication, examId);
    }

    @GetMapping("/findings")
    public List<FindingSummary> findings(
            Authentication authentication,
            @PathVariable Long examId,
            @RequestParam(required = false) FindingType type,
            @RequestParam(required = false) FindingStatus status) {
        return findingQueryService.list(authentication, examId, type, status);
    }
}
