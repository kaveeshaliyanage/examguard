import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { ApiError } from './api/client';
import { AppRoutes } from './router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { StudentAuthProvider } from './features/student/StudentAuthProvider';
import { theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ToastProvider>
          <ErrorBoundary>
            <BrowserRouter>
              <AuthProvider>
                <StudentAuthProvider>
                  <AppRoutes />
                </StudentAuthProvider>
              </AuthProvider>
            </BrowserRouter>
          </ErrorBoundary>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
