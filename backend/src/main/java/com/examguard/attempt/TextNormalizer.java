package com.examguard.attempt;

public final class TextNormalizer {

    private TextNormalizer() {
    }

    public static String normalize(String text) {
        if (text == null) {
            return "";
        }
        return text.replaceAll("\\s+", " ").trim();
    }

    public static int wordCount(String text) {
        String normalized = normalize(text);
        if (normalized.isEmpty()) {
            return 0;
        }
        return normalized.split(" ").length;
    }
}
