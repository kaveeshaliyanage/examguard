import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { CodeGradeDetail } from '../api/types';

const STATUS_LABELS: Record<string, { label: string; color: 'success' | 'error' | 'default' }> = {
  PASSED: { label: 'Passed', color: 'success' },
  FAILED: { label: 'Wrong output', color: 'error' },
  TIMEOUT: { label: 'Timed out', color: 'error' },
  RUNTIME_ERROR: { label: 'Runtime error', color: 'error' },
  LIMIT_EXCEEDED: { label: 'Limit exceeded', color: 'error' },
  COMPILE_ERROR: { label: 'Did not compile', color: 'error' },
  NOT_RUN: { label: 'Not run', color: 'default' },
};

export function CodeTestResults({
  detail,
  title = 'Test results',
}: {
  detail: CodeGradeDetail;
  title?: string;
}) {
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle2" component="h6">
          {title}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color={detail.passed === detail.total ? 'success' : 'default'}
          label={`${detail.passed} of ${detail.total} passed`}
        />
      </Stack>
      {detail.tests.map((test, index) => {
        const status = STATUS_LABELS[test.status] ?? { label: test.status, color: 'default' as const };
        return (
          <Stack
            key={`${test.name}-${index}`}
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 160 }}>
              <Typography variant="body2">{test.name}</Typography>
            </Box>
            <Chip size="small" variant="outlined" color={status.color} label={status.label} />
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56, textAlign: 'right' }}>
              {test.durationMs} ms
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}
