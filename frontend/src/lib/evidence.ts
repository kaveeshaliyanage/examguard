import { isRecord } from '../api/client';
import type { EvidenceView } from '../api/types';

export interface SimilarityRow {
  questionId: number;
  rawCosine: number;
  cohortMean: number;
  normalizedExcess: number;
}

export interface TimingRow {
  questionId: number;
  leader: string;
  follower: string;
  deltaSeconds: number;
  similarity: number;
}

export interface VisitRow {
  domain: string;
  occurredAt: string;
  rule: string | null;
  note: string | null;
}

export interface ChangeRow {
  questionId: number;
  revisionNo: number;
  domain: string;
  deltaSeconds: number;
  deltaChars: number;
}

export interface CoverageMeta {
  coveragePercent: number | null;
  extensionConnected: boolean | null;
  eventCount: number | null;
  substantiveQuestions: number | null;
}

function numberAt(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringAt(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function recordsAt(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringsAt(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

export function similarityRows(evidence: EvidenceView): SimilarityRow[] {
  return recordsAt(evidence.metadata, 'perQuestion').flatMap((row) => {
    const questionId = numberAt(row, 'questionId');
    const rawCosine = numberAt(row, 'rawCosine');
    const cohortMean = numberAt(row, 'cohortMean');
    const normalizedExcess = numberAt(row, 'normalizedExcess');
    if (questionId === null || rawCosine === null || cohortMean === null || normalizedExcess === null) {
      return [];
    }
    return [{ questionId, rawCosine, cohortMean, normalizedExcess }];
  });
}

export function metadataStrings(evidence: EvidenceView, key: string): string[] {
  return stringsAt(evidence.metadata, key);
}

export function sharedPhrases(evidence: EvidenceView): string[] {
  return [
    ...metadataStrings(evidence, 'sharedShingles'),
    ...metadataStrings(evidence, 'sharedTokens'),
    ...metadataStrings(evidence, 'spellingVariants'),
    ...metadataStrings(evidence, 'crossQuestionShingles'),
  ];
}

export function patternDomains(evidence: EvidenceView): string[] {
  return stringsAt(evidence.metadata, 'domains');
}

export function timingRows(evidence: EvidenceView): TimingRow[] {
  return recordsAt(evidence.metadata, 'examples').flatMap((row) => {
    const questionId = numberAt(row, 'questionId');
    const leader = stringAt(row, 'leader');
    const follower = stringAt(row, 'follower');
    const deltaSeconds = numberAt(row, 'deltaSeconds');
    const similarity = numberAt(row, 'similarity');
    if (
      questionId === null ||
      leader === null ||
      follower === null ||
      deltaSeconds === null ||
      similarity === null
    ) {
      return [];
    }
    return [{ questionId, leader, follower, deltaSeconds, similarity }];
  });
}

export function visitRows(evidence: EvidenceView): VisitRow[] {
  return recordsAt(evidence.metadata, 'visits').flatMap((row) => {
    const domain = stringAt(row, 'domain');
    const occurredAt = stringAt(row, 'occurredAt');
    if (domain === null || occurredAt === null) {
      return [];
    }
    return [{ domain, occurredAt, rule: stringAt(row, 'rule'), note: stringAt(row, 'note') }];
  });
}

export function changeRows(evidence: EvidenceView): ChangeRow[] {
  return recordsAt(evidence.metadata, 'changes').flatMap((row) => {
    const questionId = numberAt(row, 'questionId');
    const revisionNo = numberAt(row, 'revisionNo');
    const domain = stringAt(row, 'domain');
    const deltaSeconds = numberAt(row, 'deltaSeconds');
    const deltaChars = numberAt(row, 'deltaChars');
    if (
      questionId === null ||
      revisionNo === null ||
      domain === null ||
      deltaSeconds === null ||
      deltaChars === null
    ) {
      return [];
    }
    return [{ questionId, revisionNo, domain, deltaSeconds, deltaChars }];
  });
}

export function coverageMeta(evidence: EvidenceView): CoverageMeta {
  const meta = evidence.metadata;
  const connected = meta.extensionConnected;
  return {
    coveragePercent: numberAt(meta, 'coveragePercent'),
    extensionConnected: typeof connected === 'boolean' ? connected : null,
    eventCount: numberAt(meta, 'eventCount'),
    substantiveQuestions: numberAt(meta, 'substantiveQuestions'),
  };
}
