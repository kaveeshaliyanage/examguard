import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the console breadcrumb for local debugging; no data is sent anywhere.
    console.error('ExamGuard UI error', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Paper elevation={2} sx={{ p: 4, maxWidth: 560, width: '100%' }}>
          <Stack spacing={2}>
            <Alert severity="error" variant="outlined">
              <AlertTitle>Something went wrong in the interface</AlertTitle>
              Your answers are stored on the server whenever autosave succeeded. Reload this page to
              continue; if the problem persists, contact your invigilator or lecturer.
            </Alert>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {error.message}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={() => window.location.reload()}>
                Reload page
              </Button>
              <Button variant="outlined" onClick={this.reset}>
                Try again
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }
}
