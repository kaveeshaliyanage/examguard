import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SaveStatus } from './useAutosave';
import { formatDateTime } from '../../lib/format';

export function SaveIndicator({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: string | null;
}) {
  if (status === 'error') {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" color="error" variant="outlined" label="Not saved — retrying" />
        <Typography variant="caption" color="text.secondary">
          Your text stays in this tab.
        </Typography>
      </Stack>
    );
  }
  if (status === 'saving') {
    return <Chip size="small" color="info" variant="outlined" label="Saving…" />;
  }
  if (status === 'dirty') {
    return <Chip size="small" variant="outlined" label="Unsaved changes" />;
  }
  return (
    <Typography variant="caption" color="text.secondary">
      {lastSavedAt ? `Saved ${formatDateTime(lastSavedAt)}` : 'All answers saved'}
    </Typography>
  );
}
