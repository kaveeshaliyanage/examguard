import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { readAttemptSession } from './storage';

export function RequireAttempt({ children }: { children: ReactNode }) {
  const { attemptId } = useParams();
  const id = Number(attemptId);
  const session = Number.isFinite(id) && id > 0 ? readAttemptSession(id) : null;

  if (!session) {
    return <Navigate to="/join" replace />;
  }
  return <>{children}</>;
}
