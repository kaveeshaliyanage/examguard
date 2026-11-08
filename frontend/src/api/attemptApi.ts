import { isArrayOf, isJoinResponse, isRecord, request } from './client';
import type {
  AttemptState,
  IntegritySignal,
  IntegritySignalResponse,
  JoinResponse,
  SaveAnswerResponse,
  SubmitResponse,
} from './types';

function isAnswer(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.questionId === 'number' &&
    typeof value.text === 'string' &&
    (value.selectedOptions === undefined || isArrayOf(value.selectedOptions, (item) => typeof item === 'string'))
  );
}

function isAttemptState(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.attemptId === 'number' &&
    typeof value.status === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.serverNow === 'string' &&
    isRecord(value.exam) &&
    isArrayOf(value.answers, isAnswer)
  );
}

function isIntegritySignalResponse(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.strikeCount === 'number' &&
    typeof value.maxStrikes === 'number' &&
    typeof value.terminated === 'boolean' &&
    typeof value.status === 'string'
  );
}

export function joinExam(examCode: string, candidateCode: string): Promise<JoinResponse> {
  return request<JoinResponse>('/public/join', {
    method: 'POST',
    body: { examCode, candidateCode },
    validate: isJoinResponse,
  });
}

export function fetchAttemptState(attemptId: number, token: string): Promise<AttemptState> {
  return request<AttemptState>(`/attempts/${attemptId}`, {
    token,
    scope: 'attempt',
    validate: isAttemptState,
  });
}

export function saveAnswer(
  attemptId: number,
  token: string,
  questionId: number,
  text: string,
  clientSeq: number,
  selectedOptions: string[] = [],
): Promise<SaveAnswerResponse> {
  return request<SaveAnswerResponse>(`/attempts/${attemptId}/answers/${questionId}`, {
    method: 'PUT',
    token,
    scope: 'attempt',
    body: { text, selectedOptions, clientSeq },
    validate: (value) =>
      isRecord(value) &&
      typeof value.questionId === 'number' &&
      typeof value.revisionNo === 'number' &&
      typeof value.savedAt === 'string',
  });
}

export function submitAttempt(attemptId: number, token: string): Promise<SubmitResponse> {
  return request<SubmitResponse>(`/attempts/${attemptId}/submit`, {
    method: 'POST',
    token,
    scope: 'attempt',
  });
}

export function postIntegritySignal(
  attemptId: number,
  token: string,
  episodeKey: string,
  signal: IntegritySignal,
  occurredAt: string,
): Promise<IntegritySignalResponse> {
  return request<IntegritySignalResponse>(`/attempts/${attemptId}/integrity/signals`, {
    method: 'POST',
    token,
    scope: 'attempt',
    body: { episodeKey, signal, occurredAt },
    validate: isIntegritySignalResponse,
  });
}
