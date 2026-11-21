package com.examguard.exam;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamEnrollment;
import com.examguard.domain.ExamPermission;
import com.examguard.domain.ResourceRule;
import com.examguard.exam.ExamDtos.ExamDetail;
import com.examguard.exam.ExamDtos.ExamSummary;
import com.examguard.exam.ExamDtos.PermissionView;
import com.examguard.exam.ExamDtos.RosterEntryView;
import com.examguard.exam.ExamDtos.RuleView;
import com.examguard.exam.ExamDtos.StaffQuestionView;

import java.time.Instant;
import java.util.List;

final class ExamMapper {

    private ExamMapper() {
    }

    record Counts(
            long attemptCount,
            long submittedCount,
            long findingCount,
            long openFindingCount,
            Instant lastAnalysisAt,
            long enrollmentCount,
            long releasedCount,
            long awaitingReleaseCount) {
    }

    static RuleView rule(ResourceRule rule) {
        return new RuleView(rule.getId(), rule.getCategory(), rule.getDomainPattern(), rule.getNote());
    }

    static PermissionView permission(ExamPermission permission) {
        return new PermissionView(
                permission.getUser().getId(),
                permission.getUser().getEmail(),
                permission.getUser().getDisplayName(),
                permission.getLevel());
    }

    static ExamSummary summary(Exam exam, Counts counts) {
        return new ExamSummary(
                exam.getId(),
                exam.getCode(),
                exam.getTitle(),
                exam.getStatus(),
                exam.getDurationMinutes(),
                counts.attemptCount(),
                counts.submittedCount(),
                counts.findingCount(),
                counts.openFindingCount(),
                counts.lastAnalysisAt(),
                exam.getCreatedAt());
    }

    static ExamDetail detail(
            Exam exam,
            Counts counts,
            List<StaffQuestionView> questions,
            List<ResourceRule> rules,
            List<ExamPermission> permissions) {
        return new ExamDetail(
                exam.getId(),
                exam.getCode(),
                exam.getTitle(),
                exam.getDescription(),
                exam.getStatus(),
                exam.getDurationMinutes(),
                exam.isAllowExtension(),
                exam.getMaxStrikes(),
                exam.getInstructions(),
                exam.getOpensAt(),
                exam.getClosesAt(),
                exam.getCreatedAt(),
                counts.attemptCount(),
                counts.submittedCount(),
                counts.findingCount(),
                counts.openFindingCount(),
                counts.lastAnalysisAt(),
                counts.enrollmentCount(),
                counts.releasedCount(),
                counts.awaitingReleaseCount(),
                exam.isRequiresPin(),
                exam.getAccessPinHash() != null,
                exam.getAccessPinIssuedAt(),
                exam.getAccessPinSentAt(),
                exam.isRequiresPreflight(),
                questions,
                rules.stream().map(ExamMapper::rule).toList(),
                permissions.stream().map(ExamMapper::permission).toList());
    }

    static RosterEntryView rosterEntry(ExamEnrollment enrollment) {
        return new RosterEntryView(enrollment.getId(), enrollment.getEmail(), enrollment.getCreatedAt());
    }
}
