import { isJoinResponse, isRecord, request } from './client';
import type { AttemptState, JoinResponse, SaveAnswerResponse, SubmitResponse } from './types';

function isAttemptState(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.attemptId === 'number' &&
    typeof value.status === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.serverNow === 'string' &&
    isRecord(value.exam) &&
    Array.isArray(value.answers)
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
): Promise<SaveAnswerResponse> {
  return request<SaveAnswerResponse>(`/attempts/${attemptId}/answers/${questionId}`, {
    method: 'PUT',
    token,
    scope: 'attempt',
    body: { text, clientSeq },
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
