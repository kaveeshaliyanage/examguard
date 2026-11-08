package com.examguard.repo;

import com.examguard.domain.Role;
import com.examguard.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    List<User> findAllByOrderByDisplayNameAsc();

    long countByRole(Role role);
}
