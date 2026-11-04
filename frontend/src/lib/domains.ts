const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Mirrors the backend boundary: only a bare hostname can leave the browser.
 * Paths, queries, ports, credentials and a leading `www.` are discarded here too.
 */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const at = value.indexOf('@');
  if (at >= 0) {
    value = value.slice(at + 1);
  }
  value = value.split(/[/?#]/, 1)[0] ?? '';
  value = value.split(':', 1)[0] ?? '';
  while (value.endsWith('.')) {
    value = value.slice(0, -1);
  }
  if (value.startsWith('www.')) {
    value = value.slice(4);
  }
  return HOST.test(value) ? value : null;
}

export type RuleKind = 'exact' | 'wildcard' | 'regex' | 'empty' | 'invalid';

export function describeDomainRule(pattern: string): RuleKind {
  const value = pattern.trim();
  if (!value) {
    return 'empty';
  }
  if (value.startsWith('re:')) {
    try {
      new RegExp(value.slice(3));
      return 'regex';
    } catch {
      return 'invalid';
    }
  }
  return value.startsWith('*.') ? 'wildcard' : 'exact';
}

export function ruleMatchesDomain(pattern: string, domain: string): boolean {
  const value = pattern.trim().toLowerCase();
  if (!value || !domain) {
    return false;
  }
  if (value.startsWith('re:')) {
    try {
      return new RegExp(value.slice(3)).test(domain);
    } catch {
      return false;
    }
  }
  if (value.startsWith('*.')) {
    const suffix = value.slice(2);
    return domain === suffix || domain.endsWith(`.${suffix}`);
  }
  return domain === value || domain.endsWith(`.${value}`);
}
