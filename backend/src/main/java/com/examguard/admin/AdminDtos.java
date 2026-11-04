package com.examguard.admin;

import com.examguard.domain.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class AdminDtos {

    private AdminDtos() {
    }

    public record CreateUserRequest(
            @Email @NotBlank String email,
            @NotBlank @Size(max = 255) String displayName,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotNull Role role) {
    }
}
