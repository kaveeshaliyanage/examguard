import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface StudentShellProps {
  children: ReactNode;
  title?: string;
  right?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function StudentShell({ children, title, right, maxWidth = 'md' }: StudentShellProps) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
            ExamGuard
          </Typography>
          {title ? (
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
              {title}
            </Typography>
          ) : null}
          <Box sx={{ flexGrow: 1 }} />
          {right}
        </Toolbar>
      </AppBar>

      <Container maxWidth={maxWidth} sx={{ py: { xs: 2, md: 4 }, flexGrow: 1 }}>
        {children}
      </Container>

      <Box component="footer" sx={{ py: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth={maxWidth}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Monitoring collects domain names and navigation times only. Page content, keystrokes and
              screenshots are never collected.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Review priority is not a finding of misconduct.
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
