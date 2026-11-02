package com.examguard.repo;

import com.examguard.domain.ResourceRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ResourceRuleRepository extends JpaRepository<ResourceRule, Long> {

    List<ResourceRule> findByExamIdOrderByIdAsc(Long examId);
}
