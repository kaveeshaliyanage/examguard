package com.examguard.analysis;

import com.examguard.analysis.RuleMatcher.Classification;
import com.examguard.domain.ResourceCategory;
import com.examguard.domain.ResourceRule;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RuleMatcherTest {

    private final RuleMatcher matcher = new RuleMatcher();

    @Test
    void exactRuleBeatsWildcardEvenWhenListedLater() {
        Classification result = matcher.classify("cheating.edu", List.of(
                rule(ResourceCategory.PROHIBITED, "*.edu"),
                rule(ResourceCategory.PERMITTED, "cheating.edu")));

        assertThat(result.category()).isEqualTo(ResourceCategory.PERMITTED);
        assertThat(result.rulePattern()).isEqualTo("cheating.edu");
    }

    @Test
    void wildcardMatchesSubdomainsButNotTheBareSuffix() {
        List<ResourceRule> rules = List.of(rule(ResourceCategory.PERMITTED, "*.edu"));

        assertThat(matcher.classify("https://www.university.edu/library?q=1", rules).category())
                .isEqualTo(ResourceCategory.PERMITTED);
        assertThat(matcher.classify("notedu", rules).category())
                .isEqualTo(ResourceCategory.UNCLASSIFIED);
    }

    @Test
    void regexRulesMatchAndInvalidRegexNeverBreaksClassification() {
        List<ResourceRule> rules = List.of(
                rule(ResourceCategory.PROHIBITED, "re:^(docs|api)\\.example\\.com$"),
                rule(ResourceCategory.PERMITTED, "re:([unclosed"));

        assertThat(matcher.classify("api.example.com", rules).category())
                .isEqualTo(ResourceCategory.PROHIBITED);
        assertThat(matcher.classify("other.example.com", rules).category())
                .isEqualTo(ResourceCategory.UNCLASSIFIED);
    }

    @Test
    void invalidOrUnlistedDomainsStayUnclassified() {
        List<ResourceRule> rules = List.of(rule(ResourceCategory.PERMITTED, "*.edu"));

        assertThat(matcher.classify("not a domain", rules).category())
                .isEqualTo(ResourceCategory.UNCLASSIFIED);
        assertThat(matcher.classify("wikipedia.org", rules).category())
                .isEqualTo(ResourceCategory.UNCLASSIFIED);
        assertThat(matcher.classify(null, rules).rulePattern()).isNull();
    }

    private ResourceRule rule(ResourceCategory category, String pattern) {
        ResourceRule rule = new ResourceRule();
        rule.setCategory(category);
        rule.setDomainPattern(pattern);
        return rule;
    }
}
