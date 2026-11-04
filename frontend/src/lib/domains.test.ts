import { describe, expect, it } from 'vitest';
import { normalizeDomain, describeDomainRule, ruleMatchesDomain } from './domains';

describe('normalizeDomain', () => {
  it('strips scheme, credentials, port, path, query and www', () => {
    expect(normalizeDomain('https://www.Chegg.com:8443/path/to/page?q=1#frag')).toBe('chegg.com');
    expect(normalizeDomain('http://user:pass@Sub.Example.co.uk/answer')).toBe('sub.example.co.uk');
  });

  it('keeps bare hostnames and removes a trailing dot', () => {
    expect(normalizeDomain('EXAMPLE.com.')).toBe('example.com');
    expect(normalizeDomain('www.example.org')).toBe('example.org');
  });

  it('rejects non-web schemes, empty values and non-host text', () => {
    expect(normalizeDomain('chrome://settings')).toBeNull();
    expect(normalizeDomain('about:blank')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('not a domain')).toBeNull();
  });
});

describe('domain rules', () => {
  it('describes exact, wildcard and regex rules', () => {
    expect(describeDomainRule('chegg.com')).toBe('exact');
    expect(describeDomainRule('*.edu')).toBe('wildcard');
    expect(describeDomainRule('re:.*\\.edu$')).toBe('regex');
    expect(describeDomainRule('re:[')).toBe('invalid');
    expect(describeDomainRule('   ')).toBe('empty');
  });

  it('matches suffixes and regular expressions', () => {
    expect(ruleMatchesDomain('*.edu', 'library.edu')).toBe(true);
    expect(ruleMatchesDomain('*.edu', 'notedu.org')).toBe(false);
    expect(ruleMatchesDomain('re:chegg', 'www.chegg.com')).toBe(true);
    expect(ruleMatchesDomain('chegg.com', 'www.chegg.com')).toBe(true);
  });
});
