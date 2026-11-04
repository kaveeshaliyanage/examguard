import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useDecide } from '../../api/staffQueries';
import type { DecisionOutcome, DecisionView } from '../../api/types';
import { formatDateTime, humanize } from '../../lib/format';

const outcomes: DecisionOutcome[] = ['CONFIRMED', 'DISMISSED', 'NEEDS_INFO', 'ESCALATED'];
const MIN_RATIONALE = 10;

export function DecisionPanel({
  findingId,
  decisions,
}: {
  findingId: number;
  decisions: DecisionView[];
}) {
  const [outcome, setOutcome] = useState<DecisionOutcome | ''>('');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState<string | null>(null);
  const decide = useDecide(findingId);

  const canSubmit =
    outcome !== '' && rationale.trim().length >= MIN_RATIONALE && !decide.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setError(null);
    decide.mutate(
      { outcome, rationale: rationale.trim() },
      {
        onSuccess: () => {
          setOutcome('');
          setRationale('');
        },
        onError: (caught) => {
          setError(caught instanceof ApiError ? caught.message : 'Could not save the decision.');
        },
      },
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6">Review decision</Typography>
          <Typography variant="body2" color="text.secondary">
            A human decision is required. Review the evidence and record your rationale; this
            workflow does not decide for you.
          </Typography>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Stack component="form" spacing={2} onSubmit={submit}>
          <TextField
            select
            label="Outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as DecisionOutcome)}
            fullWidth
            required
          >
            {outcomes.map((value) => (
              <MenuItem key={value} value={value}>
                {humanize(value)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Rationale"
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            multiline
            minRows={3}
            fullWidth
            required
            helperText={`At least ${MIN_RATIONALE} characters. Explain what the evidence does and does not show.`}
          />
          <Box>
            <Button type="submit" variant="contained" disabled={!canSubmit}>
              {decide.isPending ? 'Saving…' : 'Submit decision'}
            </Button>
          </Box>
        </Stack>

        <Divider />
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Decision history
          </Typography>
          {decisions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No decisions recorded yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {decisions.map((decision) => (
                <Box key={decision.id}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="baseline">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {humanize(decision.outcome)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {decision.reviewerName} · {formatDateTime(decision.createdAt)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {decision.rationale}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
