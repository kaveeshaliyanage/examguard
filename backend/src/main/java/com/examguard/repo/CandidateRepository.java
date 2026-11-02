package com.examguard.repo;

import com.examguard.domain.Candidate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CandidateRepository extends JpaRepository<Candidate, Long> {

    Optional<Candidate> findByExamIdAndCodeIgnoreCase(Long examId, String code);

    Optional<Candidate> findByIdAndExamId(Long id, Long examId);

    List<Candidate> findByExamIdOrderByCodeAsc(Long examId);
}
