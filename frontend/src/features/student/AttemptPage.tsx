import Alert from '@mui/material/Alert';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { fetchAttemptState } from '../../api/attemptApi';
import { clearAttemptSession, readAttemptSession } from '../../auth/storage';
import { LoadingBlock } from '../../components/LoadingBlock';
import { AttemptEditor } from './AttemptEditor';
import { StudentShell } from './StudentShell';

export function AttemptPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const id = Number(attemptId);
  const valid = Number.isFinite(id);
  const session = valid ? readAttemptSession(id) : null;

  useEffect(() => {
    const onUnauthorized = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail;
      if (detail?.scope === 'attempt') {
        if (valid) {
          clearAttemptSession(id);
        }
        navigate('/join', { replace: true });
      }
    };
    window.addEventListener('examguard:unauthorized', onUnauthorized);
    return () => window.removeEventListener('examguard:unauthorized', onUnauthorized);
  }, [id, navigate, valid]);

  const stateQuery = useQuery({
    queryKey: ['attempt', id],
    enabled: Boolean(session),
    retry: false,
    queryFn: () => fetchAttemptState(id, session!.sessionToken),
  });

  if (!valid || !session) {
    return <Navigate to="/join" replace />;
  }

  if (stateQuery.isLoading) {
    return (
      <StudentShell>
        <LoadingBlock rows={4} />
      </StudentShell>
    );
  }

  if (stateQuery.isError) {
    return (
      <StudentShell>
        <Alert severity="error">
          {stateQuery.error.message} If this keeps happening, ask your invigilator for help.
        </Alert>
      </StudentShell>
    );
  }

  const state = stateQuery.data;
  if (!state) {
    return (
      <StudentShell>
        <LoadingBlock rows={4} />
      </StudentShell>
    );
  }

  if (state.status === 'SUBMITTED') {
    return <Navigate to={`/attempt/${id}/submitted`} replace />;
  }

  return (
    <AttemptEditor
      key={state.attemptId}
      state={state}
      session={session}
    />
  );
}
