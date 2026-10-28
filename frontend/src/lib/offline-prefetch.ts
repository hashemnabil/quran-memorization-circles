import { db } from './db';
import { reportSyncProgress } from './sync-progress';
import { applySnapshotPatch } from './snapshot-delta';
import { cacheConversations } from './conversation-cache';

type Send = (method: string, path: string, headers?: Record<string, string>) => Promise<any>;
type Snapshot = { data: any; rows?: any[]; paginated: boolean; registry?: boolean; savedAt: string };
const key = (account: string, path: string, params: Record<string, any> = {}) => {
  const url = new URL(path, 'https://local.invalid');
  for (const [field, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(field, String(value));
  url.searchParams.sort();
  return `${account}:prefetch:${url.pathname}${url.search}`;
};

/** Read-only boot download. Every request still passes server authorization. */
export async function prefetchSections(send: Send, account: string, currentAccount: () => string, role: string, changedEntities?: string[]) {
  const staff = ['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(role);
  const manager = ['ADMIN', 'SUPERVISOR'].includes(role);
  const today = new Date().toISOString().slice(0, 10);
  const paths = new Set(['/settings/public', '/settings', '/announcements/active', '/users/directory', '/support', '/support/stats', '/chat/conversations', '/chat/unread-count', '/dashboard/overview']);
  if (staff) ['/parents/options', '/transfers', '/suspensions', '/suspensions/active', '/preparations', '/attendance/stats', '/exams/upcoming'].forEach(path => paths.add(path));
  if (manager) ['/users/staff', '/courses/stats', '/staff-attendance', '/staff-attendance/history', '/staff-attendance/summary', '/media-activities'].forEach(path => paths.add(path));
  if (manager) paths.add(`/staff-attendance/sheet?date=${today}`);
  if (['ADMIN', 'SUPPORT'].includes(role)) paths.add('/support/staff');
  if (['ADMIN', 'EXAM_COMMITTEE'].includes(role)) paths.add('/exams/examiners');
  if (role === 'ADMIN') ['/users', '/users/stats', '/parents', '/announcements', '/certificates/templates', '/certificates/issued', '/certificates/requests', '/dashboard/activity', '/students/accounts', '/notifications/recipients'].forEach(path => paths.add(path));
  if (role === 'ADMIN') {
    paths.add('/registry/admin/stats'); paths.add('/registry/admin/users');
    paths.add(`/certificates/monthly-report-data?from=${today.slice(0, 7)}-01&to=${today}`);
  }
  if (role === 'TEACHER') paths.add('/teachers/my-overview');
  if (role === 'STUDENT') ['/students/me', '/students/me/history', '/certificates/mine', '/certificates/requests/mine', '/preparations'].forEach(path => paths.add(path));
  if (role === 'PARENT') { paths.add('/parents/my-children'); paths.add('/preparations'); }
  if (staff) {
    for (const row of await db.circles.where('accountId').equals(account).toArray()) {
      paths.add(`/circles/${row.id}/history`); paths.add(`/attendance/circle/${row.id}/summary`);
    }
    for (const row of await db.students.where('accountId').equals(account).toArray()) paths.add(`/students/${row.id}/evaluations`);
    for (const row of await db.courses.where('accountId').equals(account).toArray()) {
      paths.add(`/courses/${row.id}/attendance/history`);
      paths.add(`/courses/${row.id}/attendance/sheet?date=${today}`);
    }
  }
  let failure: unknown;
  const dependencies: Record<string, string[]> = {
    notifications: ['users', 'students', 'circles', 'teacher_profiles', 'circle_teachers', 'broadcast_activity_v1'],
    settings: ['school_settings'], announcements: ['announcements'], users: ['users', 'teacher_profiles', 'circle_teachers', 'circles', 'students', 'chat_contact_policy'],
    support: ['support_tickets', 'ticket_messages', 'users'], chat: ['conversations', 'conversation_members', 'messages', 'users', 'circle_teachers', 'circles', 'students', 'chat_contact_policy'],
    parents: ['parent_profiles', 'students', 'circles', 'users'], transfers: ['transfer_requests', 'students'],
    suspensions: ['suspension_requests', 'students'], preparations: ['preparation_assignments', 'students'],
    attendance: ['attendance', 'students', 'circles'], exams: ['exams', 'exam_requests', 'exam_sections', 'users'],
    courses: ['courses', 'course_enrollments', 'course_attendance', 'students'],
    'staff-attendance': ['staff_attendance', 'users'], 'media-activities': ['media_activities'],
    certificates: ['certificate_records', 'certificate_templates', 'student_file_requests', 'students', 'attendance', 'recitations'],
    registry: ['registry_users'], circles: ['circles', 'circle_teachers', 'circle_memberships', 'students', 'attendance', 'recitations', 'exams'],
    students: ['students', 'student_evaluations', 'student_notes', 'attendance', 'recitations', 'exams', 'exam_requests', 'preparation_assignments', 'surah_completions'],
    teachers: ['teacher_profiles', 'users', 'students', 'attendance', 'recitations', 'circle_teachers'],
  };
  const affected = (path: string) => !changedEntities || path.startsWith('/dashboard/') ||
    (dependencies[path.split('/')[1]] || []).some(entity => changedEntities.includes(entity));
  if (['STUDENT', 'TEACHER'].includes(role)) paths.add('/profile-reviews/me');
  const pending = [...paths].filter(path => path === '/profile-reviews/me' ? !changedEntities || changedEntities.some(entity => ['profile_reviews', 'students', 'teacher_profiles', 'users'].includes(entity)) : affected(path));
  const visited = new Set<string>();
  const download = async (path: string) => {
    const rows: any[] = []; let result: any; let paginated = false; let registry = false;
    for (let page = 1; ; page++) {
      if (currentAccount() !== account || !navigator.onLine) throw new Error('انقطع تنزيل البيانات؛ ستتم إعادة المحاولة تلقائيًا');
      // Start with defaults: non-paginated DTOs must not receive unsupported parameters.
      const pagePath = page === 1 ? path : `${path}${path.includes('?') ? '&' : '?'}page=${page}`;
      const pageKey = `${account}:prefetch-page:${pagePath}`;
      const previous = (await db.meta.get(pageKey))?.value;
      const response = await send('get', pagePath, { 'X-Offline-Snapshot': '1', ...(previous?.token ? { 'X-Offline-Base': previous.token } : {}) });
      if (response?.offlineDelta && response.offlineDelta.baseToken !== previous?.token) throw new Error('نسخة التحديث غير مطابقة');
      result = response?.offlineSnapshot ? response.offlineSnapshot.data : (response?.offlineDelta
        ? applySnapshotPatch(previous?.data, response.offlineDelta.patch) : response);
      if (currentAccount() !== account) return;
      const token = response?.offlineSnapshot?.token || response?.offlineDelta?.token;
      if (token) await db.meta.put({ key: pageKey, value: { token, data: result } });
      if (Array.isArray(result?.data) && result.meta) {
        paginated = true; rows.push(...result.data);
        if (result.meta.hasNextPage || page < Number(result.meta.totalPages || 1)) continue;
      }
      if (Array.isArray(result?.items) && typeof result.pages === 'number') {
        registry = paginated = true; rows.push(...result.items);
        if (page < result.pages) continue;
      }
      break;
    }
    if (currentAccount() !== account) return;
    const data = paginated ? { ...result, [registry ? 'items' : 'data']: rows } : result;
    if (path === '/chat/conversations' && Array.isArray(data)) await cacheConversations(account, data, true);
    if (/^\/chat\/conversations\/[^/]+$/.test(path) && data?.id) await cacheConversations(account, [data]);
    if (path === '/profile-reviews/me' && data?.profile && Array.isArray(data.requests)) {
      await db.meta.put({ key: `${account}:reference:/profile-reviews/me`, value: data });
      await db.transaction('rw', db.table('profileReviews'), async () => {
        for (const request of data.requests) {
          if (typeof request.id !== 'string' || (await db.table('profileReviews').get([account, request.id]))?.synced === 0) continue;
          await db.table('profileReviews').put({ ...request, accountId: account, synced: 1 });
        }
      });
    }
    await db.meta.put({ key: key(account, path), value: { data, rows: paginated ? rows : Array.isArray(data) ? data : undefined, paginated, registry, savedAt: new Date().toISOString() } satisfies Snapshot });
    // Exact request caches must not override a newer permission-filtered snapshot offline.
    if (['/users/directory', '/dashboard/activity', '/notifications/recipients'].includes(path) || path.startsWith('/chat/conversations')) {
      await db.responses.where('accountId').equals(account).filter(row => {
        try { return JSON.parse(row.key)[1] === path; } catch { return false; }
      }).delete();
    }
    const items = paginated ? rows : Array.isArray(data) ? data : [];
    for (const row of items) {
      if (row?.id) {
        if (['/support', '/transfers', '/suspensions', '/users', '/parents', '/chat/conversations', '/parents/my-children', '/registry/admin/users'].includes(path)) pending.push(`${path}/${encodeURIComponent(row.id)}`);
        if (path === '/chat/conversations') pending.push(`${path}/${encodeURIComponent(row.id)}/messages`);
      }
      if (/^\/courses\/[^/]+\/attendance\/history$/.test(path) && row.date) pending.push(path.replace(/history$/, String(row.date).slice(0, 10)));
      if (path === '/staff-attendance/history' && row.date) pending.push(`${path}/${String(row.date).slice(0, 10)}`);
    }
  };
  // One background request at a time leaves capacity for the page the user opens.
  while (pending.length && currentAccount() === account && navigator.onLine) {
    const batch = pending.splice(0, 1).filter(path => !visited.has(path));
    batch.forEach(path => visited.add(path));
    await Promise.all(batch.map(async path => {
      try { await download(path); }
      catch (error: any) {
        if (error?.response?.status === 403 || error?.response?.status === 404) {
          await db.meta.delete(key(account, path));
        } else { failure ||= error; }
      }
    }));
    reportSyncProgress(account, 75 + 24 * visited.size / (visited.size + pending.length));
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (currentAccount() !== account) return;
  if (failure) throw failure;
  if (pending.length) throw new Error('انقطع تنزيل البيانات؛ ستتم إعادة المحاولة تلقائيًا');
  await db.meta.put({ key: `${account}:sectionsDownloadedAt`, value: new Date().toISOString() });
  if (!changedEntities || changedEntities.includes('broadcast_activity_v1')) await db.meta.put({ key: `${account}:broadcastActivityV1`, value: true });
  if (!changedEntities || changedEntities.includes('chat_contact_policy')) await db.meta.put({ key: `${account}:chatContactPolicyV1`, value: true });
}

/** Snapshots of extra sections are used only offline; core entities stay local-first. */
export async function readPrefetched(account: string, path: string, params: Record<string, any> = {}) {
  if (Object.values(params).some(value => value !== undefined && value !== '')) {
    const exact = (await db.meta.get(key(account, path, params)))?.value as Snapshot | undefined;
    if (exact && !exact.paginated) return exact.data;
  }
  const snapshot = (await db.meta.get(key(account, path)))?.value as Snapshot | undefined;
  if (!snapshot) return undefined;
  const filters = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  if (!filters.length && !snapshot.paginated) return snapshot.data;
  if (!snapshot.rows) return undefined;
  const supported = ['page', 'limit', 'pageSize', 'search', 'sortBy', 'sortOrder', 'category', 'status', 'role', 'priority', 'studentId', 'circleId', 'userId', 'type', 'isActive', 'mine', 'pending', 'from', 'to', 'fromDate', 'toDate'];
  if (filters.some(([field]) => !supported.includes(field))) return undefined;
  let rows = snapshot.rows.filter(row => filters.every(([field, value]) => {
    if (['page', 'limit', 'pageSize', 'sortBy', 'sortOrder'].includes(field)) return true;
    if (field === 'search') return JSON.stringify(row).toLocaleLowerCase().includes(String(value).toLocaleLowerCase());
    if (field === 'mine') return String(value) !== 'true' || row.assignedToId === account || row.assignedTo?.id === account;
    if (field === 'pending') return String(value) !== 'true' || !row.completedAt;
    const date = String(row.date || row.createdAt || '').slice(0, 10);
    if (field === 'from' || field === 'fromDate') return date >= String(value);
    if (field === 'to' || field === 'toDate') return date <= String(value);
    return String(row[field] ?? row.user?.[field] ?? row.student?.[field]) === String(value);
  }));
  if (params.sortBy) rows = [...rows].sort((a, b) => String(a[params.sortBy] || '').localeCompare(String(b[params.sortBy] || '')) * (params.sortOrder === 'asc' ? 1 : -1));
  if (!snapshot.paginated) return rows;
  const page = Math.max(1, Number(params.page) || 1), limit = Math.max(1, Number(params.pageSize || params.limit) || 20);
  if (snapshot.registry) return { ...snapshot.data, items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, pageSize: limit, pages: Math.ceil(rows.length / limit) };
  return { ...snapshot.data, data: rows.slice((page - 1) * limit, page * limit), meta: { total: rows.length, page, limit, totalPages: Math.max(1, Math.ceil(rows.length / limit)), hasNextPage: page * limit < rows.length, hasPreviousPage: page > 1 } };
}
