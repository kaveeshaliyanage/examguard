package com.examguard.student;

import com.examguard.attempt.AttemptDtos.JoinRequest;
import com.examguard.attempt.AttemptDtos.JoinResponse;
import com.examguard.student.StudentDtos.AuthResponse;
import com.examguard.student.StudentDtos.LoginRequest;
import com.examguard.student.StudentDtos.RegisterRequest;
import com.examguard.student.StudentDtos.StudentAttemptSummary;
import com.examguard.student.StudentDtos.StudentProfile;
import jakarta.servlet.http.HttpServletRequest;
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
@RequestMapping("/api/student")
public class StudentController {

    private final StudentService studentService;

    public StudentController(StudentService studentService) {
        this.studentService = studentService;
    }

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return studentService.register(request);
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        return studentService.login(request, http.getRemoteAddr());
    }

    @GetMapping("/me")
    public StudentProfile me(Authentication authentication) {
        return studentService.me(authentication);
    }

    @PostMapping("/attempts/join")
    public JoinResponse join(Authentication authentication, @Valid @RequestBody JoinRequest request) {
        return studentService.join(authentication, request);
    }

    @GetMapping("/attempts")
    public List<StudentAttemptSummary> attempts(Authentication authentication) {
        return studentService.attempts(authentication);
    }
}
