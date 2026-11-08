import Alert from '@mui/material/Alert';
import type { ReactNode } from 'react';
import { useAuth } from '../AuthProvider';
import { AppShell } from '../components/AppShell';

export function RequireRole({ role, children }: { role: 'ADMIN'; children: ReactNode }) {
  const { session } = useAuth();
  if (session?.user.role !== role) {
    return (
      <AppShell>
        <Alert severity="warning">
          This area is limited to administrators. Ask an administrator if you need access.
        </Alert>
      </AppShell>
    );
  }
  return <>{children}</>;
}
