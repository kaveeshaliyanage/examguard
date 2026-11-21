import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isArrayOf, isRecord, request } from './client';
import { readStaffSession } from '../auth/storage';
import type {
  AdminDashboardData,
  CodeJudgeSummary,
  GradeResponse,
  GradingRow,
  LecturerDashboardData,
  ReleaseResponse,
  StudentDashboardData,
} from './types';

function staffToken(): string | null {
  return readStaffSession()?.token ?? null;
}

function staffRequest<T>(path: string, options: Parameters<typeof request>[1] = {}): Promise<T> {
  return request<T>(path, { ...options, token: staffToken(), scope: 'staff' });
}

export function useLecturerDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'lecturer'],
    queryFn: () =>
      staffRequest<LecturerDashboardData>('/dashboard/lecturer', {
        validate: (value) => isRecord(value) && isArrayOf(value.exams, isRecord),
      }),
  });
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () =>
      staffRequest<AdminDashboardData>('/dashboard/admin', {
        validate: (value) => isRecord(value) && isRecord(value.counts),
      }),
  });
}

export function useStudentDashboard(token: string | null | undefined) {
  return useQuery({
    queryKey: ['dashboard', 'student', token],
    enabled: Boolean(token),
    queryFn: () =>
      request<StudentDashboardData>('/dashboard/student', {
        token,
        scope: 'student',
        validate: (value) => isRecord(value) && isRecord(value.stats),
      }),
  });
}

export function useGradingQueue(examId: number | undefined) {
  return useQuery({
    queryKey: ['grading', examId],
    enabled: Number.isFinite(examId),
    queryFn: () =>
      staffRequest<GradingRow[]>(`/exams/${examId}/grading`, {
        validate: (value) => isArrayOf(value, (item) => isRecord(item) && typeof item.questionId === 'number'),
      }),
  });
}

export function useGradeAnswer(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { attemptId: number; questionId: number; awardedPoints: number; comment?: string }) =>
      staffRequest<GradeResponse>(`/attempts/${input.attemptId}/answers/${input.questionId}/grade`, {
        method: 'PUT',
        body: { awardedPoints: input.awardedPoints, comment: input.comment ?? null },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['grading', examId] });
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useJudgeCode(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => staffRequest<CodeJudgeSummary>(`/exams/${examId}/code-judge`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['grading', examId] });
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useReleaseGrades(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      staffRequest<ReleaseResponse>(`/exams/${examId}/grades/release`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['grading', examId] });
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'lecturer'] });
    },
  });
}
