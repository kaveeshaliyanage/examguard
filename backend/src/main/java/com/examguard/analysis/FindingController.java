package com.examguard.analysis;

import com.examguard.analysis.FindingViewDtos.FindingDetail;
import com.examguard.analysis.FindingViewDtos.FindingOverviewRow;
import com.examguard.domain.FindingStatus;
import com.examguard.domain.FindingType;
import com.examguard.domain.PriorityBand;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/findings")
public class FindingController {

    private final FindingQueryService findingQueryService;

    public FindingController(FindingQueryService findingQueryService) {
        this.findingQueryService = findingQueryService;
    }

    @GetMapping
    public List<FindingOverviewRow> overview(
            Authentication authentication,
            @RequestParam(required = false) Long examId,
            @RequestParam(required = false) FindingType type,
            @RequestParam(required = false) FindingStatus status,
            @RequestParam(required = false) PriorityBand band,
            @RequestParam(defaultValue = "100") int limit) {
        return findingQueryService.overview(authentication, examId, type, status, band, limit);
    }

    @GetMapping("/{findingId}")
    public FindingDetail detail(Authentication authentication, @PathVariable Long findingId) {
        return findingQueryService.detail(authentication, findingId);
    }
}
