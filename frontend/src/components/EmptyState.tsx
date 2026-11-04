import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
      <Stack spacing={1.5} alignItems="center">
        <Typography variant="h6">{title}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 560 }}>
          {body}
        </Typography>
        {action}
      </Stack>
    </Paper>
  );
}
