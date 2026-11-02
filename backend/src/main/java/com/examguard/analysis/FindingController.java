package com.examguard.analysis;

import com.examguard.analysis.FindingViewDtos.FindingDetail;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/findings")
public class FindingController {

    private final FindingQueryService findingQueryService;

    public FindingController(FindingQueryService findingQueryService) {
        this.findingQueryService = findingQueryService;
    }

    @GetMapping("/{findingId}")
    public FindingDetail detail(Authentication authentication, @PathVariable Long findingId) {
        return findingQueryService.detail(authentication, findingId);
    }
}
