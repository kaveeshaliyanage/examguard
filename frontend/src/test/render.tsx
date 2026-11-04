import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../AuthProvider';
import { theme } from '../theme';

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(ui: ReactElement) {
  return render(<Providers>{ui}</Providers>);
}

export function renderRoute(
  ui: ReactElement,
  options: { path: string; initialEntry: string },
) {
  return render(
    <Providers>
      <MemoryRouter initialEntries={[options.initialEntry]}>
        <AuthProvider>
          <Routes>
            <Route path={options.path} element={ui} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </Providers>,
  );
}
