package com.examguard.admin;

import com.examguard.admin.AdminDtos.CreateUserRequest;
import com.examguard.dto.CommonDtos.UserView;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping
    public List<UserView> list(Authentication authentication) {
        return adminService.listUsers(authentication);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserView create(Authentication authentication, @Valid @RequestBody CreateUserRequest request) {
        return adminService.createUser(authentication, request);
    }
}
