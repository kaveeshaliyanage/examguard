package com.examguard.attempt;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Reduces any observed URL or hostname to a bare host. Paths, queries, ports and user info are
 * discarded at the boundary so they can never be stored.
 */
public final class DomainNormalizer {

    private static final Pattern HOST = Pattern.compile(
            "^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$");

    private DomainNormalizer() {
    }

    public static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String value = raw.trim().toLowerCase(Locale.ROOT);
        value = value.replaceFirst("^[a-z][a-z0-9+.-]*://", "");
        int at = value.indexOf('@');
        if (at >= 0) {
            value = value.substring(at + 1);
        }
        value = value.split("[/?#]", 2)[0];
        value = value.split(":", 2)[0];
        while (value.endsWith(".")) {
            value = value.substring(0, value.length() - 1);
        }
        if (value.startsWith("www.")) {
            value = value.substring(4);
        }
        return HOST.matcher(value).matches() ? value : null;
    }
}
