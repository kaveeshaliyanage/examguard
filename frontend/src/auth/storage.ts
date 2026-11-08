import { isRecord, isString } from '../api/client';
import type { StudentUser, User } from '../api/types';

const STAFF_KEY = 'examguard.staff';

export interface StaffSession {
  token: string;
  user: User;
}

export interface AttemptSession {
  attemptId: number;
  sessionToken: string;
  collectorToken: string;
  candidateCode: string;
  examCode: string;
}

function isStaffUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    isString(value.email) &&
    isString(value.displayName) &&
    isString(value.role)
  );
}

export function readStaffSession(): StaffSession | null {
  const raw = sessionStorage.getItem(STAFF_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && isString(parsed.token) && isStaffUser(parsed.user)) {
      return { token: parsed.token, user: parsed.user };
    }
  } catch {
    // A corrupt value is treated as signed out.
  }
  sessionStorage.removeItem(STAFF_KEY);
  return null;
}

export function writeStaffSession(session: StaffSession): void {
  sessionStorage.setItem(STAFF_KEY, JSON.stringify(session));
}

export function clearStaffSession(): void {
  sessionStorage.removeItem(STAFF_KEY);
}

export function attemptStorageKey(attemptId: number): string {
  return `examguard.attempt.${attemptId}`;
}

export function writeAttemptSession(session: AttemptSession): void {
  sessionStorage.setItem(attemptStorageKey(session.attemptId), JSON.stringify(session));
}

export function readAttemptSession(attemptId: number): AttemptSession | null {
  const raw = sessionStorage.getItem(attemptStorageKey(attemptId));
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) {
      const { sessionToken, collectorToken, candidateCode, examCode } = parsed;
      if (
        parsed.attemptId === attemptId &&
        isString(sessionToken) &&
        isString(collectorToken) &&
        isString(candidateCode) &&
        isString(examCode)
      ) {
        return { attemptId, sessionToken, collectorToken, candidateCode, examCode };
      }
    }
  } catch {
    // Fall through to clearing the stale value.
  }
  sessionStorage.removeItem(attemptStorageKey(attemptId));
  return null;
}

export function clearAttemptSession(attemptId: number): void {
  sessionStorage.removeItem(attemptStorageKey(attemptId));
}

export interface AttemptReceipt {
  attemptId: number;
  candidateCode: string;
  examCode: string;
  examTitle: string;
  submittedAt: string;
  late: boolean;
}

function receiptKey(attemptId: number): string {
  return `examguard.receipt.${attemptId}`;
}

export function writeAttemptReceipt(receipt: AttemptReceipt): void {
  sessionStorage.setItem(receiptKey(receipt.attemptId), JSON.stringify(receipt));
}

export function readAttemptReceipt(attemptId: number): AttemptReceipt | null {
  const raw = sessionStorage.getItem(receiptKey(attemptId));
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      isRecord(parsed) &&
      parsed.attemptId === attemptId &&
      isString(parsed.candidateCode) &&
      isString(parsed.examCode) &&
      isString(parsed.examTitle) &&
      isString(parsed.submittedAt) &&
      typeof parsed.late === 'boolean'
    ) {
      return {
        attemptId,
        candidateCode: parsed.candidateCode,
        examCode: parsed.examCode,
        examTitle: parsed.examTitle,
        submittedAt: parsed.submittedAt,
        late: parsed.late,
      };
    }
  } catch {
    // A corrupt receipt is ignored.
  }
  return null;
}

const STUDENT_KEY = 'examguard.student';

export interface StudentSession {
  token: string;
  user: StudentUser;
}

function isStudentUser(value: unknown): value is StudentUser {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    isString(value.email) &&
    isString(value.displayName)
  );
}

export function readStudentSession(): StudentSession | null {
  const raw = sessionStorage.getItem(STUDENT_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && isString(parsed.token) && isStudentUser(parsed.user)) {
      return { token: parsed.token, user: parsed.user };
    }
  } catch {
    // A corrupt value is treated as signed out.
  }
  sessionStorage.removeItem(STUDENT_KEY);
  return null;
}

export function writeStudentSession(session: StudentSession): void {
  sessionStorage.setItem(STUDENT_KEY, JSON.stringify(session));
}

export function clearStudentSession(): void {
  sessionStorage.removeItem(STUDENT_KEY);
}
