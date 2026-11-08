import { API_BASE, ApiError, isArrayOf, isJoinResponse, isRecord, request } from './client';
import type {
  AttemptReport,
  JoinResponse,
  StudentAttemptSummary,
  StudentLoginResponse,
  StudentUser,
} from './types';

function isStudentUser(value: unknown): value is StudentUser {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.email === 'string' &&
    typeof value.displayName === 'string'
  );
}

function isStudentLoginResponse(value: unknown): value is StudentLoginResponse {
  return isRecord(value) && typeof value.token === 'string' && isStudentUser(value.user);
}

function isStudentAttempt(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.attemptId === 'number' &&
    typeof value.examCode === 'string' &&
    typeof value.examTitle === 'string' &&
    typeof value.status === 'string' &&
    typeof value.released === 'boolean'
  );
}

function isAttemptReport(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.attemptId === 'number' &&
    typeof value.examTitle === 'string' &&
    typeof value.status === 'string' &&
    isArrayOf(value.questions, (item) => isRecord(item) && typeof item.prompt === 'string') &&
    isRecord(value.integrity) &&
    isArrayOf(value.reviewSignals, (item) => isRecord(item))
  );
}

export function loginStudent(email: string, password: string): Promise<StudentLoginResponse> {
  return request<StudentLoginResponse>('/student/auth/login', {
    method: 'POST',
    body: { email, password },
    validate: isStudentLoginResponse,
  });
}

export function registerStudent(
  email: string,
  password: string,
  displayName: string,
): Promise<StudentLoginResponse> {
  return request<StudentLoginResponse>('/student/auth/register', {
    method: 'POST',
    body: { email, password, displayName },
    validate: isStudentLoginResponse,
  });
}

export function fetchStudentMe(token: string): Promise<StudentUser> {
  return request<StudentUser>('/student/me', {
    token,
    scope: 'student',
    validate: isStudentUser,
  });
}

export function fetchStudentAttempts(token: string): Promise<StudentAttemptSummary[]> {
  return request<StudentAttemptSummary[]>('/student/attempts', {
    token,
    scope: 'student',
    validate: (value) => isArrayOf(value, isStudentAttempt),
  });
}

export function joinStudentExam(
  token: string,
  examCode: string,
  candidateCode: string,
): Promise<JoinResponse> {
  return request<JoinResponse>('/student/attempts/join', {
    method: 'POST',
    token,
    scope: 'student',
    body: { examCode, candidateCode },
    validate: isJoinResponse,
  });
}

export function fetchAttemptReport(attemptId: number, token: string): Promise<AttemptReport> {
  return request<AttemptReport>(`/reports/attempts/${attemptId}`, {
    token,
    scope: 'attempt',
    validate: isAttemptReport,
  });
}

/**
 * The report PDF needs a bearer token, so a plain anchor href cannot download it.
 * Fetch with the header, turn the response into a blob and hand the caller an
 * object URL to click.
 */
export async function downloadAttemptReportPdf(attemptId: number, token: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/reports/attempts/${attemptId}/pdf`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
    });
  } catch {
    throw new ApiError(0, 'Network unavailable. The PDF could not be downloaded.', 'report-pdf', 'network');
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'The PDF report could not be downloaded.', 'report-pdf');
  }
  return response.blob();
}
