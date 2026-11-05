import { describe, expect, it } from 'vitest';
import { normalizeApiBase, normalizeDomain } from './domains';

describe('normalizeDomain', () => {
  it('keeps only the lower-case hostname without www', () => {
    expect(normalizeDomain('https://www.Chegg.com:8443/path?q=secret#frag')).toBe('chegg.com');
    expect(normalizeDomain('http://user:pass@Sub.Example.co.uk/answers')).toBe(
      'sub.example.co.uk',
    );
  });

  it('ignores internal, extension and file pages', () => {
    expect(normalizeDomain('chrome://settings')).toBeNull();
    expect(normalizeDomain('edge://history')).toBeNull();
    expect(normalizeDomain('about:blank')).toBeNull();
    expect(normalizeDomain('file:///C:/answers.txt')).toBeNull();
    expect(normalizeDomain('chrome-extension://abcdef/popup.html')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
  });

  it('rejects malformed values', () => {
    expect(normalizeDomain('not a url')).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
  });
});

describe('normalizeApiBase', () => {
  it('accepts http(s) bases and removes trailing slashes', () => {
    expect(normalizeApiBase('http://localhost:8080/api/')).toBe('http://localhost:8080/api');
    expect(normalizeApiBase(' https://examguard.example/api ')).toBe(
      'https://examguard.example/api',
    );
  });

  it('rejects other schemes, credentials and query strings', () => {
    expect(normalizeApiBase('chrome://settings')).toBeNull();
    expect(normalizeApiBase('ftp://example.com/api')).toBeNull();
    expect(normalizeApiBase('https://user:pass@example.com/api')).toBeNull();
    expect(normalizeApiBase('https://example.com/api?token=1')).toBeNull();
    expect(normalizeApiBase('')).toBeNull();
  });
});
