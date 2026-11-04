import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { PriorityBand } from '../api/types';
import { BandChip } from './BandChip';

export function ReviewPriority({ score, band }: { score: number; band: PriorityBand }) {
  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
      <Box>
        <Typography variant="h4" component="p" sx={{ lineHeight: 1.1 }}>
          {Math.round(score)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Review priority (0–100)
        </Typography>
      </Box>
      <BandChip band={band} />
    </Stack>
  );
}
