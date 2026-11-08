import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loginStudent, registerStudent } from '../../api/studentApi';
import {
  clearStudentSession,
  readStudentSession,
  writeStudentSession,
  type StudentSession,
} from '../../auth/storage';

interface StudentAuthContextValue {
  session: StudentSession | null;
  signIn: (email: string, password: string) => Promise<StudentSession>;
  register: (email: string, password: string, displayName: string) => Promise<StudentSession>;
  signOut: () => void;
}

const fallback: StudentAuthContextValue = {
  session: null,
  signIn: () => Promise.reject(new Error('StudentAuthProvider is missing')),
  register: () => Promise.reject(new Error('StudentAuthProvider is missing')),
  signOut: () => undefined,
};

const StudentAuthContext = createContext<StudentAuthContextValue>(fallback);

export function StudentAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StudentSession | null>(() => readStudentSession());

  useEffect(() => {
    const onUnauthorized = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail;
      if (detail?.scope === 'student') {
        clearStudentSession();
        setSession(null);
      }
    };
    window.addEventListener('examguard:unauthorized', onUnauthorized);
    return () => window.removeEventListener('examguard:unauthorized', onUnauthorized);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await loginStudent(email, password);
    const next = { token: response.token, user: response.user };
    writeStudentSession(next);
    setSession(next);
    return next;
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const response = await registerStudent(email, password, displayName);
    const next = { token: response.token, user: response.user };
    writeStudentSession(next);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    clearStudentSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, signIn, register, signOut }),
    [session, signIn, register, signOut],
  );

  return <StudentAuthContext.Provider value={value}>{children}</StudentAuthContext.Provider>;
}

export function useStudentAuth(): StudentAuthContextValue {
  return useContext(StudentAuthContext);
}
