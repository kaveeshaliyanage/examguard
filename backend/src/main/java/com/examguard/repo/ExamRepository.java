package com.examguard.repo;

import com.examguard.domain.Exam;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ExamRepository extends JpaRepository<Exam, Long> {

    Optional<Exam> findByCodeIgnoreCase(String code);

    List<Exam> findAllByOrderByCreatedAtDesc();

    @Query("""
            select p.exam from ExamPermission p
            where p.user.id = :userId
            order by p.exam.createdAt desc
            """)
    List<Exam> findAllForUser(@Param("userId") Long userId);
}
