import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAddPermission, useRemovePermission, useUpdateStatus } from '../../api/staffQueries';
import type { ExamDetail, PermissionLevel } from '../../api/types';
import { StatusChip } from '../../components/StatusChip';
import { humanize } from '../../lib/format';

const levels: PermissionLevel[] = ['OWNER', 'REVIEWER', 'VIEWER'];

interface SettingsTabProps {
  exam: ExamDetail;
  canManage: boolean;
}

export function SettingsTab({ exam, canManage }: SettingsTabProps) {
  const statusMutation = useUpdateStatus(exam.id);
  const addPermission = useAddPermission(exam.id);
  const removePermission = useRemovePermission(exam.id);
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<PermissionLevel>('REVIEWER');
  const [error, setError] = useState<string | null>(null);

  const changeStatus = (next: 'OPEN' | 'CLOSED') => {
    setError(null);
    statusMutation.mutate(next, {
      onError: (caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not change the exam status.'),
    });
  };

  const grant = () => {
    setError(null);
    addPermission.mutate(
      { email: email.trim(), level },
      {
        onSuccess: () => setEmail(''),
        onError: (caught) =>
          setError(caught instanceof ApiError ? caught.message : 'Could not grant permission.'),
      },
    );
  };

  const revoke = (userId: number) => {
    setError(null);
    removePermission.mutate(userId, {
      onError: (caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not remove permission.'),
    });
  };

  return (
    <Stack spacing={3}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Status
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <StatusChip status={exam.status} />
          {canManage && exam.status === 'DRAFT' ? (
            <Button variant="contained" onClick={() => changeStatus('OPEN')} disabled={statusMutation.isPending}>
              Open exam for candidates
            </Button>
          ) : null}
          {canManage && exam.status === 'OPEN' ? (
            <Button
              variant="outlined"
              color="warning"
              onClick={() => changeStatus('CLOSED')}
              disabled={statusMutation.isPending}
            >
              Close exam
            </Button>
          ) : null}
          {!canManage ? (
            <Typography variant="body2" color="text.secondary">
              Only an exam owner can change its status.
            </Typography>
          ) : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Permissions
        </Typography>
        <Stack spacing={2}>
          {exam.permissions.map((permission) => (
            <Stack key={permission.userId} direction="row" spacing={2} alignItems="center">
              <Typography sx={{ minWidth: 220 }}>{permission.displayName}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                {permission.email}
              </Typography>
              <Typography variant="body2">{humanize(permission.level)}</Typography>
              {canManage ? (
                <IconButton
                  aria-label={`Remove permission for ${permission.displayName}`}
                  onClick={() => revoke(permission.userId)}
                  disabled={removePermission.isPending}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              ) : null}
            </Stack>
          ))}
          {canManage ? (
            <>
              <Divider />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
                <TextField
                  label="Staff email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  fullWidth
                />
                <TextField
                  select
                  label="Level"
                  value={level}
                  onChange={(event) => setLevel(event.target.value as PermissionLevel)}
                  sx={{ minWidth: 150 }}
                >
                  {levels.map((value) => (
                    <MenuItem key={value} value={value}>
                      {humanize(value)}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  onClick={grant}
                  disabled={!email.trim() || addPermission.isPending}
                >
                  Grant
                </Button>
              </Stack>
            </>
          ) : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Audit trail
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Every staff mutation and review decision is recorded.
        </Typography>
        <Button component={RouterLink} to={`/exams/${exam.id}/audit`}>
          Open audit trail
        </Button>
      </Paper>
    </Stack>
  );
}
