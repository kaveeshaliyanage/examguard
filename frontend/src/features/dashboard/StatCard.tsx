import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ChipProps } from '@mui/material/Chip';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  hint?: string;
  tone?: ChipProps['color'] | 'default';
  to?: string;
}

const toneColor: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'primary.main',
  primary: 'primary.main',
  secondary: 'secondary.main',
  success: 'success.main',
  warning: 'warning.main',
  error: 'error.main',
  info: 'info.main',
};

export function StatCard({ label, value, icon, hint, tone = 'default', to }: StatCardProps) {
  const content = (
    <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center">
          {icon ? (
            <Box sx={{ color: toneColor[tone], display: 'inline-flex' }} aria-hidden>
              {icon}
            </Box>
          ) : null}
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
        </Stack>
        <Typography variant="h4" sx={{ fontWeight: 700, color: toneColor[tone] }}>
          {value}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );

  if (to) {
    return (
      <Box
        component={RouterLink}
        to={to}
        sx={{ textDecoration: 'none', '&:hover .MuiPaper-root': { borderColor: 'primary.main' } }}
      >
        {content}
      </Box>
    );
  }
  return content;
}
