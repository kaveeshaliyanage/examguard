package com.examguard.dashboard;

import com.examguard.dashboard.DashboardDtos.AdminDashboard;
import com.examguard.dashboard.DashboardDtos.LecturerDashboard;
import com.examguard.dashboard.DashboardDtos.StudentDashboard;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/student")
    public StudentDashboard student(Authentication authentication) {
        return dashboardService.student(authentication);
    }

    @GetMapping("/lecturer")
    public LecturerDashboard lecturer(Authentication authentication) {
        return dashboardService.lecturer(authentication);
    }

    @GetMapping("/admin")
    public AdminDashboard admin(Authentication authentication) {
        return dashboardService.admin(authentication);
    }
}
