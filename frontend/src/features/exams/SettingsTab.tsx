import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
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
import {
  useAddPermission,
  useAddRosterEntry,
  useRemovePermission,
  useRemoveRosterEntry,
  useRoster,
  useUpdateStatus,
} from '../../api/staffQueries';
import type { ExamDetail, PermissionLevel } from '../../api/types';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { useToast } from '../../components/ToastProvider';
import { formatDateTime, humanize } from '../../lib/format';
import { ExamSettingsForm } from './ExamSettingsForm';

const levels: PermissionLevel[] = ['OWNER', 'REVIEWER', 'VIEWER'];

interface SettingsTabProps {
  exam: ExamDetail;
  canManage: boolean;
}

export function SettingsTab({ exam, canManage }: SettingsTabProps) {
  const { showToast } = useToast();
  const statusMutation = useUpdateStatus(exam.id);
  const addPermission = useAddPermission(exam.id);
  const removePermission = useRemovePermission(exam.id);
  const roster = useRoster(exam.id);
  const addRosterEntry = useAddRosterEntry(exam.id);
  const removeRosterEntry = useRemoveRosterEntry(exam.id);
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<PermissionLevel>('REVIEWER');
  const [rosterEmail, setRosterEmail] = useState('');
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

  const enrol = () => {
    setError(null);
    addRosterEntry.mutate(rosterEmail.trim(), {
      onSuccess: () => {
        setRosterEmail('');
        showToast('Student added to the roster.', { severity: 'success' });
      },
      onError: (caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not add that email.'),
    });
  };

  const unenrol = (entryId: number) => {
    setError(null);
    removeRosterEntry.mutate(entryId, {
      onSuccess: () => showToast('Student removed from the roster.', { severity: 'success' }),
      onError: (caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not remove that email.'),
    });
  };

  const enrolled = roster.data ?? [];

  return (
    <Stack spacing={3}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <ExamSettingsForm exam={exam} canManage={canManage} />

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
          Results
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
          <Box>
            <Typography variant="h5">{exam.submittedCount}</Typography>
            <Typography variant="body2" color="text.secondary">
              Submitted attempts
            </Typography>
          </Box>
          <Box>
            <Typography variant="h5">{exam.releasedCount}</Typography>
            <Typography variant="body2" color="text.secondary">
              Released to students
            </Typography>
          </Box>
          <Box>
            <Typography variant="h5">{exam.awaitingReleaseCount}</Typography>
            <Typography variant="body2" color="text.secondary">
              Awaiting release
            </Typography>
          </Box>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Students see scores only after results are released for the whole exam.
        </Typography>
        <Button
          component={RouterLink}
          to={`/exams/${exam.id}?tab=grading`}
          variant="outlined"
          sx={{ mt: 1.5 }}
        >
          Open grading
        </Button>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Participant roster
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {enrolled.length > 0
            ? 'Joins are restricted to these email addresses. Guests and unlisted accounts are refused.'
            : 'No roster yet: anyone with the exam code can join. Add at least one email to restrict joins.'}
        </Typography>
        {roster.isLoading ? <LoadingBlock rows={2} /> : null}
        {roster.isError ? <Alert severity="error">{roster.error.message}</Alert> : null}
        {!roster.isLoading && enrolled.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No students enrolled.
          </Typography>
        ) : null}
        <Stack spacing={1}>
          {enrolled.map((entry) => (
            <Stack
              key={entry.id}
              direction="row"
              spacing={2}
              alignItems="center"
              sx={{ py: 0.5 }}
            >
              <Typography sx={{ flexGrow: 1 }}>{entry.email}</Typography>
              <Typography variant="caption" color="text.secondary">
                Added {formatDateTime(entry.createdAt)}
              </Typography>
              {canManage ? (
                <IconButton
                  aria-label={`Remove ${entry.email} from the roster`}
                  onClick={() => unenrol(entry.id)}
                  disabled={removeRosterEntry.isPending}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              ) : null}
            </Stack>
          ))}
        </Stack>
        {canManage ? (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
              <TextField
                label="Student email"
                type="email"
                value={rosterEmail}
                onChange={(event) => setRosterEmail(event.target.value)}
                fullWidth
                helperText="The address the student signs in with, or registers with."
              />
              <Button
                variant="contained"
                onClick={enrol}
                disabled={!rosterEmail.trim() || addRosterEntry.isPending}
                sx={{ flexShrink: 0, mt: { sm: 0 } }}
              >
                {addRosterEntry.isPending ? 'Adding…' : 'Add to roster'}
              </Button>
            </Stack>
          </>
        ) : null}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Staff permissions
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
          Every staff mutation, roster change and review decision is recorded.
        </Typography>
        <Button component={RouterLink} to={`/exams/${exam.id}/audit`}>
          Open audit trail
        </Button>
        <Chip size="small" variant="outlined" sx={{ ml: 1 }} label={`${exam.enrollmentCount} enrolled`} />
      </Paper>
    </Stack>
  );
}
