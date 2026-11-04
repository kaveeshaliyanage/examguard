package com.examguard.analysis;

import com.examguard.attempt.DomainNormalizer;
import com.examguard.domain.ResourceCategory;
import com.examguard.domain.ResourceRule;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/** Classifies an observed domain for the incident context shown to reviewers. */
@Component
public class RuleMatcher {

    public record Classification(ResourceCategory category, String rulePattern) {
    }

    public Classification classify(String rawDomain, List<ResourceRule> rules) {
        String domain = DomainNormalizer.normalize(rawDomain);
        if (domain == null) {
            return new Classification(ResourceCategory.UNCLASSIFIED, null);
        }
        ResourceRule best = null;
        int bestSpecificity = 0;
        for (ResourceRule rule : rules) {
            int specificity = match(domain, rule.getDomainPattern());
            if (specificity > bestSpecificity) {
                best = rule;
                bestSpecificity = specificity;
            }
        }
        if (best == null) {
            return new Classification(ResourceCategory.UNCLASSIFIED, null);
        }
        return new Classification(best.getCategory(), best.getDomainPattern());
    }

    /** Higher specificity wins: exact 4, suffix 3, wildcard 2, regex 1. */
    private int match(String domain, String rawPattern) {
        String pattern = rawPattern.trim().toLowerCase(Locale.ROOT);
        if (pattern.isEmpty()) {
            return 0;
        }
        if (pattern.startsWith("re:")) {
            try {
                return Pattern.compile(pattern.substring(3)).matcher(domain).find() ? 1 : 0;
            } catch (PatternSyntaxException ex) {
                return 0;
            }
        }
        if (pattern.startsWith("*.")) {
            String suffix = pattern.substring(2);
            return domain.equals(suffix) || domain.endsWith("." + suffix) ? 2 : 0;
        }
        return domain.equals(pattern) || domain.endsWith("." + pattern) ? 4 : 0;
    }
}
