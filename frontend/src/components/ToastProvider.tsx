import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';

interface ToastMessage {
  id: number;
  message: string;
  severity: ToastSeverity;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: { severity?: ToastSeverity; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback<ToastContextValue['showToast']>((message, options) => {
    const entry: ToastMessage = {
      id: nextId.current,
      message,
      severity: options?.severity ?? 'info',
      duration: options?.duration ?? 5000,
    };
    nextId.current += 1;
    setQueue((current) => [...current, entry]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setQueue((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);
  const current = queue[0];

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.id ?? 'empty'}
        open={Boolean(current)}
        autoHideDuration={current?.duration ?? 5000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') {
            return;
          }
          if (current) {
            dismiss(current.id);
          }
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={() => dismiss(current.id)}
            sx={{ minWidth: 280, boxShadow: 3 }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}
