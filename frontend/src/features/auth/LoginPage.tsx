import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthProvider';
import { ApiError } from '../../api/client';

interface LoginState {
  from?: string;
}

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LoginState | null)?.from ?? '/exams';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) {
    return <Navigate to={from} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign-in failed. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper elevation={2} sx={{ p: 4, width: '100%', maxWidth: 420 }}>
        <Stack spacing={2} component="form" onSubmit={submit}>
          <Box>
            <Typography variant="h5" color="primary" sx={{ fontWeight: 700 }}>
              ExamGuard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review triage for online examination submissions.
            </Typography>
          </Box>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={busy} size="large">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Demo accounts: lecturer@examguard.local / Lecturer123! · reviewer@examguard.local /
            Reviewer123! · admin@examguard.local / Admin123!
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Review priority is not a finding of misconduct.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
