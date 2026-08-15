import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import AppLayout from '@/components/layout/AppLayout';
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from '@/components/RouteGuards';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import CirclesPage from '@/pages/circles/CirclesPage';
import CircleDetailsPage from '@/pages/circles/CircleDetailsPage';
import StudentsPage from '@/pages/students/StudentsPage';
import StudentDetailsPage from '@/pages/students/StudentDetailsPage';
import TeachersPage from '@/pages/teachers/TeachersPage';
import TeacherDetailsPage from '@/pages/teachers/TeacherDetailsPage';
import ParentsPage from '@/pages/parents/ParentsPage';
import AttendancePage from '@/pages/attendance/AttendancePage';
import RecitationsPage from '@/pages/recitations/RecitationsPage';
import ExamsPage from '@/pages/exams/ExamsPage';
import TransfersPage from '@/pages/transfers/TransfersPage';
import SuspensionsPage from '@/pages/suspensions/SuspensionsPage';
import ParentChildrenPage from '@/pages/parent/ParentChildrenPage';
import ParentChildDetailsPage from '@/pages/parent/ParentChildDetailsPage';
import ChatPage from '@/pages/chat/ChatPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SupportPage from '@/pages/support/SupportPage';
import SupportTicketPage from '@/pages/support/SupportTicketPage';
import UsersPage from '@/pages/users/UsersPage';
import SettingsPage from '@/pages/SettingsPage';
import ProfilePage from '@/pages/ProfilePage';
import { ForbiddenPage, NotFoundPage } from '@/pages/ErrorPages';

export default function App() {
  const loadSession = useAuthStore((s) => s.loadSession);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />

        <Route
          path="circles"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE']}>
              <CirclesPage />
            </RequireRole>
          }
        />
        <Route
          path="circles/:id"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE']}>
              <CircleDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="students"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE']}>
              <StudentsPage />
            </RequireRole>
          }
        />
        <Route
          path="students/:id"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE']}>
              <StudentDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="teachers"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'EXAM_COMMITTEE']}>
              <TeachersPage />
            </RequireRole>
          }
        />
        <Route
          path="teachers/:id"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE']}>
              <TeacherDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="parents"
          element={
            <RequireRole roles={['ADMIN']}>
              <ParentsPage />
            </RequireRole>
          }
        />

        <Route
          path="attendance"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <AttendancePage />
            </RequireRole>
          }
        />
        <Route
          path="recitations"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <RecitationsPage />
            </RequireRole>
          }
        />

        <Route
          path="exams/*"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE']}>
              <ExamsPage />
            </RequireRole>
          }
        />
        <Route
          path="transfers/*"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <TransfersPage />
            </RequireRole>
          }
        />
        <Route
          path="suspensions/*"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <SuspensionsPage />
            </RequireRole>
          }
        />

        <Route
          path="parent/children"
          element={
            <RequireRole roles={['PARENT']}>
              <ParentChildrenPage />
            </RequireRole>
          }
        />
        <Route
          path="parent/children/:id"
          element={
            <RequireRole roles={['PARENT']}>
              <ParentChildDetailsPage />
            </RequireRole>
          }
        />

        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:id" element={<ChatPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="support/:id" element={<SupportTicketPage />} />

        <Route
          path="users"
          element={
            <RequireRole roles={['ADMIN']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="settings"
          element={
            <RequireRole roles={['ADMIN']}>
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route path="profile" element={<ProfilePage />} />

        <Route path="forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
