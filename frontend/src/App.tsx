import { ThemeProvider } from '@/components/ThemeSelect';
import AppSecurityGate from '@/components/AppSecurityGate';
import ProfileVerificationPage, { ProfileReviewsPage } from '@/pages/ProfileVerificationPage';
import NativeBackNavigation from '@/components/NativeBackNavigation';
import MeetingsPage from '@/pages/MeetingsPage';
import { lazy, Suspense, useEffect } from 'react';
import { LoadingState } from '@/components/ui';
import AppLaunchGate from '@/components/AppLaunchGate';
import PrayerTimesPage from '@/pages/PrayerTimesPage';
import PrayerReminderSettingsPage from '@/pages/PrayerReminderSettingsPage';
import NotificationSoundSettingsPage from '@/pages/NotificationSoundSettingsPage';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { startHeartbeat } from '@/lib/session';
import { queryClient } from '@/lib/queryClient';
import { persistQueryCache, restoreQueryCache } from '@/lib/offline/queryCache';
import AppLayout from '@/components/layout/AppLayout';
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from '@/components/RouteGuards';

import LoginPage from '@/pages/LoginPage';
import PrivacyPage from '@/pages/PrivacyPage';
import AboutPage from '@/pages/AboutPage';
import AccountDeletionPage from '@/pages/AccountDeletionPage';
import BroadcastPage from '@/pages/BroadcastPage';
import ActivityPage from '@/pages/ActivityPage';
import PasswordRequestsPage from '@/pages/PasswordRequestsPage';
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
import StudentPortalPage from '@/pages/StudentPortalPage';
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
import StudentAccountsPage from '@/pages/students/StudentAccountsPage';
import StudentFilesPage from '@/pages/StudentFilesPage';
const CertificatesAdminPage = lazy(() => import('@/pages/CertificatesAdminPage'));
import MediaActivitiesPage from '@/pages/MediaActivitiesPage';
import { MediaSchedulePage, TeacherDutyPage } from '@/pages/SchedulesPage';
import CirclesPage from '@/pages/circles/CirclesPage';
import CircleDetailsPage from '@/pages/circles/CircleDetailsPage';
import StudentsPage from '@/pages/students/StudentsPage';
const StudentDetailsPage = lazy(() => import('@/pages/students/StudentDetailsPage'));
import TeachersPage from '@/pages/teachers/TeachersPage';
import TeacherDetailsPage from '@/pages/teachers/TeacherDetailsPage';
import AttendancePage from '@/pages/attendance/AttendancePage';
import AbsencePermissionsPage from '@/pages/attendance/AbsencePermissionsPage';
import RecitationsPage from '@/pages/recitations/RecitationsPage';
const ExamsPage = lazy(() => import('@/pages/exams/ExamsPage'));
import TransfersPage from '@/pages/transfers/TransfersPage';
import SuspensionsPage from '@/pages/suspensions/SuspensionsPage';
const CommunityPage = lazy(() => import('@/pages/community/CommunityPage'));
const ChatPage = lazy(() => import('@/pages/chat/ChatPage'));
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
import OfflineSettingsPage from '@/pages/OfflineSettingsPage';
import ProfilePage from '@/pages/ProfilePage';
import { ForbiddenPage, NotFoundPage } from '@/pages/ErrorPages';
import RegistryLoginPage from '@/pages/RegistryLoginPage';
import RegistryDataPage from '@/pages/RegistryDataPage';
import RegistryAdminPage from '@/pages/RegistryAdminPage';
import DonationsPage from '@/pages/DonationsPage';

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
    void restoreQueryCache(currentUser.id, () => active && useAuthStore.getState().user?.id === currentUser.id).catch(() => false).finally(() => {
      if (!active) return;
      // Signal that this account's durable snapshot has been restored before
      // background refreshes can replace cached reads with network responses.
      window.dispatchEvent(new CustomEvent('qc:offline-cache-restored', { detail: { accountId: currentUser.id } }));
      // Cached data is only the offline fallback. On every online app launch,
      // invalidate active reads so the server is contacted before stale rows settle.
      if (navigator.onLine) void queryClient.invalidateQueries({ refetchType: 'active' });
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
    <AppLaunchGate><ThemeProvider />
      <NativeBackNavigation />
      <AppSecurityGate><Suspense fallback={<LoadingState />}>
      <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contribute" element={<DonationsPage />} />
      <Route path="/account-deletion" element={<AccountDeletionPage />} />
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
        <Route path="verify-profile" element={<RequireRole roles={['STUDENT', 'TEACHER']}><ProfileVerificationPage /></RequireRole>} />
        <Route path="profile-reviews/students" element={<RequireRole roles={['ADMIN']}><ProfileReviewsPage kind="STUDENT" /></RequireRole>} />
        <Route path="profile-reviews/teachers" element={<RequireRole roles={['ADMIN']}><ProfileReviewsPage kind="TEACHER" /></RequireRole>} />
        <Route path="settings/offline" element={<OfflineSettingsPage />} />
        <Route path="prayer-times" element={<PrayerTimesPage />} />
        <Route path="prayer-times/reminders" element={<PrayerReminderSettingsPage key={currentUser?.id} />} />
        <Route path="profile/settings/notifications/sound" element={<NotificationSoundSettingsPage key={currentUser?.id} />} />
        <Route path="donations" element={<DonationsPage />} />
        <Route path="admin/notifications" element={<RequireRole roles={['ADMIN']}><BroadcastPage /></RequireRole>} />
        <Route path="meetings" element={<RequireRole roles={['ADMIN']}><MeetingsPage /></RequireRole>} />
        <Route path="admin/activity" element={<RequireRole roles={['ADMIN']}><ActivityPage /></RequireRole>} />
        <Route path="admin/password-requests" element={<RequireRole roles={['ADMIN']}><PasswordRequestsPage /></RequireRole>} />
        <Route index element={currentUser?.role === 'STUDENT' ? <StudentPortalPage /> : <DashboardPage />} />
        <Route path="student" element={<RequireRole roles={['STUDENT']}><StudentPortalPage /></RequireRole>} />
        <Route path="reports" element={<RequireRole roles={['ADMIN']}><ReportsPage /></RequireRole>} />
        <Route path="documents/:report" element={<RequireRole roles={['ADMIN']}><ReportsPage /></RequireRole>} />
        <Route path="student-accounts" element={<RequireRole roles={['ADMIN']}><StudentAccountsPage /></RequireRole>} />
        <Route path="certificates-admin" element={<RequireRole roles={['ADMIN']}><CertificatesAdminPage /></RequireRole>} />
        <Route path="media-activities" element={<RequireRole roles={['ADMIN', 'SUPERVISOR']}><MediaActivitiesPage /></RequireRole>} />
        <Route path="media-schedule" element={<RequireRole roles={['ADMIN']}><MediaSchedulePage /></RequireRole>} />
        <Route path="teacher-duties" element={<RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER']}><TeacherDutyPage /></RequireRole>} />
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
        <Route path="absence-permissions" element={<RequireRole roles={['ADMIN', 'SUPERVISOR', 'TEACHER', 'STUDENT']}><AbsencePermissionsPage /></RequireRole>} />
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

        <Route path="community" element={<CommunityPage />} />
        <Route path="community/posts" element={<CommunityPage />} />
        <Route path="community/stories" element={<CommunityPage />} />
        <Route path="community/school" element={<CommunityPage />} />
        <Route path="community/users/:userId" element={<CommunityPage />} />
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
        <Route path="profile" element={<ProfilePage />} /><Route path="profile/settings" element={<ProfilePage settings />} />

        <Route path="forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
      </Suspense></AppSecurityGate>
    </AppLaunchGate>
  );
}
