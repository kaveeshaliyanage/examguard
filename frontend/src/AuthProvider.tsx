import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isLoginResponse, request } from './api/client';
import type { LoginResponse } from './api/types';
import {
  clearStaffSession,
  readStaffSession,
  writeStaffSession,
  type StaffSession,
} from './auth/storage';

interface AuthContextValue {
  session: StaffSession | null;
  signIn: (email: string, password: string) => Promise<StaffSession>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StaffSession | null>(() => readStaffSession());

  useEffect(() => {
    const onUnauthorized = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail;
      if (detail?.scope === 'staff') {
        clearStaffSession();
        setSession(null);
      }
    };
    window.addEventListener('examguard:unauthorized', onUnauthorized);
    return () => window.removeEventListener('examguard:unauthorized', onUnauthorized);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      validate: isLoginResponse,
    });
    const next = { token: response.token, user: response.user };
    writeStaffSession(next);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    clearStaffSession();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
