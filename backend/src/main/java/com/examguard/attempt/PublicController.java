package com.examguard.attempt;

import com.examguard.attempt.AttemptDtos.JoinRequest;
import com.examguard.attempt.AttemptDtos.JoinResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public")
public class PublicController {

    private final JoinService joinService;

    public PublicController(JoinService joinService) {
        this.joinService = joinService;
    }

    @PostMapping("/join")
    public JoinResponse join(@Valid @RequestBody JoinRequest request, HttpServletRequest http) {
        return joinService.join(request, null, http.getRemoteAddr());
    }
}
