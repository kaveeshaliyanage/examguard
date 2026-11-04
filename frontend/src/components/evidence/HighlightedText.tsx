import type { ReactNode } from 'react';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function HighlightedText({
  text,
  phrases,
}: {
  text: string;
  phrases: string[];
}): ReactNode {
  const usable = [...new Set(phrases.map((phrase) => phrase.trim()).filter((phrase) => phrase.length > 2))];
  if (usable.length === 0 || text.length === 0) {
    return text;
  }
  const pattern = new RegExp(`(${usable.map(escapeRegExp).join('|')})`, 'gi');
  const lowered = new Set(usable.map((phrase) => phrase.toLowerCase()));
  return text.split(pattern).map((part, index) =>
    lowered.has(part.toLowerCase()) ? <mark key={index}>{part}</mark> : part,
  );
}
