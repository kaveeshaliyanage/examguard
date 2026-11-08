import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { RequireRole } from './auth/RequireRole';
import { RequireStaff } from './auth/RequireStaff';
import { AuditPage } from './features/audit/AuditPage';
import { LoginPage } from './features/auth/LoginPage';
import { AdminDashboardPage } from './features/dashboard/AdminDashboardPage';
import { LecturerDashboardPage } from './features/dashboard/LecturerDashboardPage';
import { CreateExamPage } from './features/exams/CreateExamPage';
import { ExamDetailPage } from './features/exams/ExamDetailPage';
import { ExamListPage } from './features/exams/ExamListPage';
import { FindingDetailPage } from './features/findings/FindingDetailPage';
import { AttemptPage } from './features/student/AttemptPage';
import { ExamInstructionsPage } from './features/student/ExamInstructionsPage';
import { StudentDashboardPage } from './features/student/StudentDashboardPage';
import { StudentReportPage } from './features/student/StudentReportPage';
import { JoinPage } from './features/student/JoinPage';
import { SubmittedPage } from './features/student/SubmittedPage';

function HomeRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? '/exams' : '/login'} replace />;
}

function Staff({ children }: { children: ReactNode }) {
  return <RequireStaff>{children}</RequireStaff>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<Staff><LecturerDashboardPage /></Staff>} />
      <Route path="/admin" element={<Staff><RequireRole role="ADMIN"><AdminDashboardPage /></RequireRole></Staff>} />
      <Route path="/exams" element={<Staff><ExamListPage /></Staff>} />
      <Route path="/exams/new" element={<Staff><CreateExamPage /></Staff>} />
      <Route path="/exams/:examId" element={<Staff><ExamDetailPage /></Staff>} />
      <Route path="/exams/:examId/audit" element={<Staff><AuditPage /></Staff>} />
      <Route path="/findings/:findingId" element={<Staff><FindingDetailPage /></Staff>} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/student" element={<StudentDashboardPage />} />
      <Route path="/attempt/:attemptId" element={<AttemptPage />} />
      <Route path="/attempt/:attemptId/instructions" element={<ExamInstructionsPage />} />
      <Route path="/attempt/:attemptId/report" element={<StudentReportPage />} />
      <Route path="/attempt/:attemptId/submitted" element={<SubmittedPage />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
