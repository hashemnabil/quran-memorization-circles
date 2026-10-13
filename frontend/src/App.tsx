import { useEffect } from 'react';
import AppLaunchGate from '@/components/AppLaunchGate';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { startHeartbeat } from '@/lib/session';
import { queryClient } from '@/lib/queryClient';
import { persistQueryCache, restoreQueryCache } from '@/lib/offline/queryCache';
import AppLayout from '@/components/layout/AppLayout';
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from '@/components/RouteGuards';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import StudentPortalPage from '@/pages/StudentPortalPage';
import ReportsPage from '@/pages/ReportsPage';
import StudentAccountsPage from '@/pages/students/StudentAccountsPage';
import StudentFilesPage from '@/pages/StudentFilesPage';
import CertificatesAdminPage from '@/pages/CertificatesAdminPage';
import MediaActivitiesPage from '@/pages/MediaActivitiesPage';
import CirclesPage from '@/pages/circles/CirclesPage';
import CircleDetailsPage from '@/pages/circles/CircleDetailsPage';
import StudentsPage from '@/pages/students/StudentsPage';
import StudentDetailsPage from '@/pages/students/StudentDetailsPage';
import TeachersPage from '@/pages/teachers/TeachersPage';
import TeacherDetailsPage from '@/pages/teachers/TeacherDetailsPage';
import AttendancePage from '@/pages/attendance/AttendancePage';
import RecitationsPage from '@/pages/recitations/RecitationsPage';
import ExamsPage from '@/pages/exams/ExamsPage';
import TransfersPage from '@/pages/transfers/TransfersPage';
import SuspensionsPage from '@/pages/suspensions/SuspensionsPage';
import ChatPage from '@/pages/chat/ChatPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SupportPage from '@/pages/support/SupportPage';
import SupportTicketPage from '@/pages/support/SupportTicketPage';
import UsersPage from '@/pages/users/UsersPage';
import StaffPage from '@/pages/staff/StaffPage';
import StaffAttendancePage from '@/pages/staff/StaffAttendancePage';
import SupervisorsPage from '@/pages/supervisors/SupervisorsPage';
import CoursesPage from '@/pages/courses/CoursesPage';
import CourseDetailsPage from '@/pages/courses/CourseDetailsPage';
import AnnouncementsPage from '@/pages/announcements/AnnouncementsPage';
import SettingsPage from '@/pages/SettingsPage';
import ProfilePage from '@/pages/ProfilePage';
import { ForbiddenPage, NotFoundPage } from '@/pages/ErrorPages';
import RegistryLoginPage from '@/pages/RegistryLoginPage';
import RegistryDataPage from '@/pages/RegistryDataPage';
import RegistryAdminPage from '@/pages/RegistryAdminPage';

export default function App() {
  const loadSession = useAuthStore((s) => s.loadSession);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Restore the last successful reads for this account, then persist cache changes.
  // The snapshot is account-scoped and is only a stale offline fallback; live queries
  // still refetch from the existing API whenever connectivity is available.
  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    void restoreQueryCache(currentUser.id).catch(() => false).finally(() => {
      if (!active) return;
      unsubscribe = queryClient.getQueryCache().subscribe(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void persistQueryCache(currentUser.id).catch(() => {
            // Offline reads are best-effort if IndexedDB is unavailable or full.
          });
        }, 400);
      });
      // Also persist the current snapshot after restoration.
      void persistQueryCache(currentUser.id).catch(() => undefined);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [currentUser?.id]);

  // Marks the app as running, so a gap in the beat means the browser was closed.
  useEffect(() => startHeartbeat(), []);

  return (
    <AppLaunchGate>
      <Routes>
      <Route path="/register" element={<RegistryLoginPage />} />
      <Route path="/register/data" element={<RegistryDataPage />} />
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
        <Route index element={currentUser?.role === 'STUDENT' ? <StudentPortalPage /> : <DashboardPage />} />
        <Route path="student" element={<RequireRole roles={['STUDENT']}><StudentPortalPage /></RequireRole>} />
        <Route path="reports" element={<RequireRole roles={['ADMIN']}><ReportsPage /></RequireRole>} />
        <Route path="documents/:report" element={<RequireRole roles={['ADMIN']}><ReportsPage /></RequireRole>} />
        <Route path="student-accounts" element={<RequireRole roles={['ADMIN']}><StudentAccountsPage /></RequireRole>} />
        <Route path="certificates-admin" element={<RequireRole roles={['ADMIN']}><CertificatesAdminPage /></RequireRole>} />
        <Route path="media-activities" element={<RequireRole roles={['ADMIN', 'SUPERVISOR']}><MediaActivitiesPage /></RequireRole>} />
        <Route path="my-files" element={<RequireRole roles={['STUDENT']}><StudentFilesPage /></RequireRole>} />

        {/* The exam committee works from the exam queue only, so the circle
            management pages are closed to it (spec item 7). */}
        <Route
          path="circles"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <CirclesPage />
            </RequireRole>
          }
        />
        <Route
          path="circles/:id"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <CircleDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="students"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <StudentsPage />
            </RequireRole>
          }
        />
        <Route
          path="students/:id"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <StudentDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="teachers"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR']}>
              <TeachersPage />
            </RequireRole>
          }
        />
        <Route
          path="teachers/:id"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <TeacherDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="supervisors"
          element={
            <RequireRole roles={['ADMIN']}>
              <SupervisorsPage />
            </RequireRole>
          }
        />

        <Route
          path="courses"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <CoursesPage />
            </RequireRole>
          }
        />
        <Route
          path="courses/:id"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}>
              <CourseDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="staff"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR']}>
              <StaffPage />
            </RequireRole>
          }
        />
        <Route
          path="staff/attendance"
          element={
            <RequireRole roles={['ADMIN', 'SUPERVISOR']}>
              <StaffAttendancePage />
            </RequireRole>
          }
        />

        <Route
          path="announcements"
          element={
            <RequireRole roles={['ADMIN']}>
              <AnnouncementsPage />
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

        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:id" element={<ChatPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="support/:id" element={<SupportTicketPage />} />

        <Route
          path="registry-admin"
          element={
            <RequireRole roles={['ADMIN']}>
              <RegistryAdminPage />
            </RequireRole>
          }
        />

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
    </AppLaunchGate>
  );
}
