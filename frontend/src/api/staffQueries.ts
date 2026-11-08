import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isArrayOf, isExamList, isFindingDetail, isRecord, request } from './client';
import type {
  AnalysisRun,
  AuditEntry,
  CreateExamInput,
  CreateQuestionInput,
  DecisionOutcome,
  DecisionView,
  ExamDetail,
  ExamQuestion,
  ExamStatus,
  ExamSummary,
  FindingDetail,
  FindingSummary,
  AttemptSummary,
  PermissionLevel,
  PermissionView,
  RosterEntry,
  UpdateExamInput,
} from './types';
import { readStaffSession } from '../auth/storage';

function staffToken(): string | null {
  return readStaffSession()?.token ?? null;
}

function staffRequest<T>(path: string, options: Parameters<typeof request>[1] = {}): Promise<T> {
  return request<T>(path, { ...options, token: staffToken(), scope: 'staff' });
}

export function useExams() {
  return useQuery({
    queryKey: ['exams'],
    queryFn: () => staffRequest<ExamSummary[]>('/exams', { validate: isExamList }),
  });
}

export function useExam(examId: number | undefined) {
  return useQuery({
    queryKey: ['exam', examId],
    enabled: Number.isFinite(examId),
    queryFn: () =>
      staffRequest<ExamDetail>(`/exams/${examId}`, {
        validate: (value) => isRecord(value) && typeof value.id === 'number',
      }),
  });
}

export function useExamAttempts(examId: number | undefined) {
  return useQuery({
    queryKey: ['exam', examId, 'attempts'],
    enabled: Number.isFinite(examId),
    queryFn: () =>
      staffRequest<AttemptSummary[]>(`/exams/${examId}/attempts`, {
        validate: (value) => isArrayOf(value, (item) => isRecord(item) && typeof item.attemptId === 'number'),
      }),
  });
}

export function useExamFindings(
  examId: number | undefined,
  filters: { type?: string; status?: string },
) {
  const params = new URLSearchParams();
  if (filters.type) {
    params.set('type', filters.type);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return useQuery({
    queryKey: ['findings', examId, filters.type ?? 'ALL', filters.status ?? 'ALL'],
    enabled: Number.isFinite(examId),
    queryFn: () =>
      staffRequest<FindingSummary[]>(`/exams/${examId}/findings${suffix}`, {
        validate: (value) => isArrayOf(value, (item) => isRecord(item) && typeof item.id === 'number'),
      }),
  });
}

export function useFinding(findingId: number | undefined) {
  return useQuery({
    queryKey: ['finding', findingId],
    enabled: Number.isFinite(findingId),
    queryFn: () =>
      staffRequest<FindingDetail>(`/findings/${findingId}`, { validate: isFindingDetail }),
  });
}

export function useAnalysisRuns(examId: number | undefined) {
  return useQuery({
    queryKey: ['exam', examId, 'runs'],
    enabled: Number.isFinite(examId),
    queryFn: () =>
      staffRequest<AnalysisRun[]>(`/exams/${examId}/analysis-runs`, {
        validate: (value) => isArrayOf(value, (item) => isRecord(item) && typeof item.id === 'number'),
      }),
  });
}

export function useAudit(examId: number | undefined) {
  return useQuery({
    queryKey: ['exam', examId, 'audit'],
    enabled: Number.isFinite(examId),
    queryFn: () =>
      staffRequest<AuditEntry[]>(`/exams/${examId}/audit`, {
        validate: (value) => isArrayOf(value, (item) => isRecord(item) && typeof item.id === 'number'),
      }),
  });
}

export function useCreateExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExamInput) =>
      staffRequest<ExamDetail>('/exams', {
        method: 'POST',
        body: input,
        validate: (value) => isRecord(value) && typeof value.id === 'number',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useUpdateStatus(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: ExamStatus) =>
      staffRequest<ExamDetail>(`/exams/${examId}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useUpdateExam(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExamInput) =>
      staffRequest<ExamDetail>(`/exams/${examId}`, {
        method: 'PATCH',
        body: input,
        validate: (value) => isRecord(value) && typeof value.id === 'number',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useRoster(examId: number | undefined) {
  return useQuery({
    queryKey: ['exam', examId, 'roster'],
    enabled: Number.isFinite(examId),
    queryFn: () =>
      staffRequest<RosterEntry[]>(`/exams/${examId}/roster`, {
        validate: (value) => isArrayOf(value, (item) => isRecord(item) && typeof item.id === 'number'),
      }),
  });
}

export function useAddRosterEntry(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      staffRequest<RosterEntry>(`/exams/${examId}/roster`, {
        method: 'POST',
        body: { email },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId, 'roster'] });
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useRemoveRosterEntry(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      staffRequest<void>(`/exams/${examId}/roster/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId, 'roster'] });
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useAddPermission(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; level: PermissionLevel }) =>
      staffRequest<PermissionView>(`/exams/${examId}/permissions`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useRemovePermission(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      staffRequest<void>(`/exams/${examId}/permissions/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useRunAnalysis(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      staffRequest<AnalysisRun>(`/exams/${examId}/analysis-runs`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      void queryClient.invalidateQueries({ queryKey: ['exam', examId, 'runs'] });
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useDecide(findingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { outcome: DecisionOutcome; rationale: string }) =>
      staffRequest<DecisionView>(`/findings/${findingId}/decisions`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useCreateQuestion(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuestionInput) =>
      staffRequest<ExamQuestion>(`/exams/${examId}/questions`, {
        method: 'POST',
        body: input,
        validate: (value) => isRecord(value) && typeof value.id === 'number',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useUpdateQuestion(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { questionId: number; payload: CreateQuestionInput }) =>
      staffRequest<ExamQuestion>(`/exams/${examId}/questions/${input.questionId}`, {
        method: 'PUT',
        body: input.payload,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useDeleteQuestion(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionId: number) =>
      staffRequest<void>(`/exams/${examId}/questions/${questionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function useReorderQuestions(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionIds: number[]) =>
      staffRequest<ExamQuestion[]>(`/exams/${examId}/questions/reorder`, {
        method: 'PUT',
        body: { questionIds },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}
