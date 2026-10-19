import { readActiveIdentity } from './active-identity';
import { db, entityTables, type EntityTable } from './db';
import { accountId, get, mergeRows, remove, save, update } from './offline-engine';

const TEMP_PASSWORD_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const TEMP_PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_PASSWORD_DIGITS = '23456789';
const TEMP_PASSWORD_ALL = TEMP_PASSWORD_LOWER + TEMP_PASSWORD_UPPER + TEMP_PASSWORD_DIGITS;

function generateTemporaryPassword(): string {
  const pick = (alphabet: string) => alphabet[crypto.getRandomValues(new Uint8Array(1))[0] % alphabet.length];
  const chars = [pick(TEMP_PASSWORD_LOWER), pick(TEMP_PASSWORD_UPPER), pick(TEMP_PASSWORD_DIGITS),
    ...Array.from({ length: 6 }, () => pick(TEMP_PASSWORD_ALL))];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export async function localRead(path: string, params: Record<string, any> = {}): Promise<any | undefined> {
  if (path.split('?')[0] === '/profile-reviews') { const kind = new URL(path, 'https://local.invalid').searchParams.get('kind') || params.kind; const data = (await get('profileReviews')).filter(row => !kind || row.kind === kind).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); const queue = await db.queue.where('accountId').equals(accountId()).filter(op => op.table === 'profileReviews').toArray(); return { data: data.map(row => ({ ...row, syncError: queue.find(op => op.entityId === row.id)?.error })), meta: { total: data.length, hasNextPage: false } }; }
  if (path === '/profile-reviews/me') {
    const account = accountId(); const reference = (await db.meta.get(`${account}:reference:/profile-reviews/me`))?.value;
    if (reference) return { ...reference, requests: (await get('profileReviews')).filter(row => row.requesterId === account).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) };
  }
  const url = new URL(path, 'https://local.invalid');
  url.searchParams.forEach((value, key) => { params[key] ??= value; });
  const segments = url.pathname.split('/').filter(Boolean);
  if (url.pathname === '/students/me') return (await get('students')).find(row => row.selfAccountId === accountId());
  if (url.pathname === '/students/accounts') return get('studentAccounts');
  if (url.pathname === '/users/stats') {
    const users = await get('users');
    return { total: users.length, active: users.filter(row => row.isActive).length,
      inactive: users.filter(row => !row.isActive).length,
      byRole: [...new Set(users.map(row => row.role))].map(role => ({ role, count: users.filter(row => row.role === role).length })) };
  }
  if (segments[0] === 'schedules') {
    const table = { media: 'mediaPlans', duties: 'teacherDuties', teachers: 'dutyTeachers' }[segments[1]] as EntityTable | undefined;
    if (table && segments.length === 2) return (await get(table)).sort((a, b) => String(a.date || a.fullName).localeCompare(String(b.date || b.fullName)));
  }
  const reference = await db.meta.get(`${accountId()}:reference:${url.pathname}`);
  if (reference) return reference.value;
  if (segments[0] === 'students' && segments[2] === 'history') return (await get('students')).find((row) => row.id === segments[1])?._offline?.history;
  if (segments[0] === 'students' && segments[2] === 'notes') return (await get('behaviors')).filter((row) => row.studentId === segments[1]);
  if (segments[0] === 'exams' && ['eligibility', 'milestones'].includes(segments[1])) return (await get('students')).find((row) => row.id === segments[2])?._offline?.[segments[1]];
  if (segments[0] === 'recitations' && segments[1] === 'student' && segments[3] === 'progress') return (await get('students')).find((row) => row.id === segments[2])?._offline?.progress;
  if (segments[0] === 'notifications' && segments[1] === 'unread-count') return { count: (await get('notifications')).filter((row) => !row.isRead).length };
  if (segments[0] === 'exams' && segments[1] === 'stats') {
    const exams = await get('exams'); const requests = await get('examRequests');
    const completed = exams.filter((row) => row.status === 'COMPLETED').length;
    const passed = exams.filter((row) => row.result === 'PASSED').length;
    return { pendingRequests: requests.filter((row) => row.status === 'PENDING').length, scheduled: exams.filter((row) => row.status === 'SCHEDULED').length,
      completed, passed, failed: exams.filter((row) => row.result === 'FAILED').length, passRate: completed ? Math.round(passed * 100 / completed) : 0 };
  }
  if (['attendance', 'recitations'].includes(segments[0]) && segments[1] === 'history') {
    const kind = segments[0] as 'attendance' | 'recitations';
    const all = (await localRead(`/${kind}`, { ...params, page: 1, limit: Number.MAX_SAFE_INTEGER })).data;
    const circles = await get('circles'); const students = await get('students');
    const enriched = all.map((row: any) => ({ ...row, student: students.find((student) => student.id === row.studentId) || row.student }));
    const totals = (rows: any[]) => kind === 'attendance' ? {
      present: rows.filter((row) => row.status === 'PRESENT').length, absent: rows.filter((row) => row.status === 'ABSENT').length,
      excused: rows.filter((row) => row.status === 'EXCUSED').length, total: rows.length,
      attendanceRate: rows.length ? Math.round(rows.filter((row) => row.status === 'PRESENT').length * 100 / rows.length) : 0,
    } : { sessions: rows.length, students: new Set(rows.map((row) => row.studentId)).size,
      points: rows.reduce((sum, row) => sum + Number(row.points || 0), 0), pages: rows.reduce((sum, row) => sum + Number(row.pagesCount || 0), 0),
      mistakes: rows.reduce((sum, row) => sum + Number(row.mistakes || 0), 0), warnings: rows.reduce((sum, row) => sum + Number(row.warnings || 0), 0) };
    if (segments.length === 4) {
      const [date, circleId] = segments.slice(2);
      const records = enriched.filter((row: any) => String(row.date).slice(0, 10) === date && row.circleId === circleId);
      const circle = circles.find((row) => row.id === circleId) || null;
      if (kind === 'attendance') return { date, circle, totals: totals(records), submittedAt: records[0]?.createdAt || null, submittedBy: records[0]?.recordedBy || null, records };
      return { date, circle, totals: totals(records), students: [...new Set(records.map((row: any) => row.studentId))].map((id) => {
        const own = records.filter((row: any) => row.studentId === id); return { student: own[0].student, records: own, ...totals(own) };
      }) };
    }
    const dates = [...new Set<string>(enriched.map((row: any) => String(row.date).slice(0, 10)))].sort().reverse();
    const rows = dates.map((date) => {
      const own = enriched.filter((row: any) => String(row.date).slice(0, 10) === date);
      const byCircle = [...new Set<string>(own.map((row: any) => row.circleId))].map((id) => ({ circle: circles.find((row) => row.id === id) || { id, name: 'بدون حلقة', code: '' }, ...totals(own.filter((row: any) => row.circleId === id)) }));
      return { date, circlesCount: byCircle.length, ...totals(own), circles: byCircle };
    });
    const page = Number(params.page) || 1; const limit = Number(params.limit) || 20;
    return { data: rows.slice((page - 1) * limit, page * limit), meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)), hasNextPage: page * limit < rows.length, hasPreviousPage: page > 1 } };
  }
  const table = (segments[0] === 'exams' && segments[1] === 'requests' ? 'examRequests' : segments[0]) as EntityTable;
  if (segments[0] === 'attendance' && segments[1] === 'sheet') {
    const circles = await get('circles'); const circle = circles.find((row) => row.id === params.circleId);
    if (!circle) return undefined;
    const students = (await get('students')).filter((row) => (row.circleId || row.circle?.id) === circle.id);
    const attendance = (await get('attendance')).filter((row) => row.circleId === circle.id && String(row.date).slice(0, 10) === params.date);
    return { circle, date: params.date, alreadyRecorded: attendance.length > 0, canSubmit: true, submittedAt: null, submittedBy: null,
      students: students.map((row) => ({ ...row, attendance: attendance.find((entry) => entry.studentId === row.id) || null })) };
  }
  if (!entityTables.includes(table)) return undefined;
  if (segments.length > (table === 'examRequests' ? 3 : 2)) return undefined;
  const id = table === 'examRequests' ? segments[2] : segments[1];
  if (id && id !== 'options' && !/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const rows = await get(table);
  if (id && id !== 'options') return rows.find((row) => row.id === id);
  if (id === 'options') return rows.map((row) => ({ id: row.id, name: row.name, code: row.code }));
  let filtered = rows.filter((row) => {
    if (params.search && ![row.fullName, row.name, row.username, row.email, row.code, row.nationalId, row.guardianName, row.guardianPhone, row.phone, row.user?.fullName].filter(Boolean).join(' ').toLocaleLowerCase().includes(String(params.search).toLocaleLowerCase())) return false;
    for (const field of ['status', 'evaluation', 'circleId', 'studentId', 'teacherId', 'type', 'gender', 'isActive', 'role']) {
      const value = params[field]; if (value === '' || value === undefined) continue;
      const actual = field === 'circleId' ? row.circleId ?? row.circle?.id : row[field];
      if (String(actual) !== String(value)) return false;
    }
    if (params.unreadOnly === true || params.unreadOnly === 'true') if (row.isRead) return false;
    if (params.track === 'CIRCLE' && (!(row.circleId || row.circle?.id) || row.status !== 'ACTIVE')) return false;
    if (params.track === 'ACTIVITY' && row.status !== 'ACTIVITY') return false;
    if (params.track === 'COURSE' && !row.courses?.length && !row.courseEnrollments?.length) return false;
    if (params.courseId && ![...(row.courses || []), ...(row.courseEnrollments || [])].some((entry: any) =>
      !entry.endedAt && (entry.courseId || entry.course?.id || entry.id) === params.courseId)) return false;
    if (params.track === 'SUSPENDED' && row.status !== 'SUSPENDED') return false;
    const date = String(row.date || row.scheduledAt || row.createdAt || '').slice(0, 10);
    if ((params.from || params.fromDate) && date < (params.from || params.fromDate)) return false;
    if ((params.to || params.toDate) && date > (params.to || params.toDate)) return false;
    return true;
  });
  const sort = params.sortBy || 'createdAt'; const direction = params.sortOrder === 'asc' ? 1 : -1;
  filtered.sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || '')) * direction);
  const page = Math.max(1, Number(params.page) || 1); const limit = Math.max(1, Number(params.limit) || 20);
  const total = filtered.length; const totalPages = Math.max(1, Math.ceil(total / limit));
  return { data: filtered.slice((page - 1) * limit, page * limit), ...(table === 'notifications' ? { unreadCount: rows.filter((row) => !row.isRead).length } : {}), meta: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
}
export async function rememberRead(path: string, params: any, data: any) {
  const account = accountId();
  await db.responses.put({ key: responseKey(account, path, params), accountId: account, data });
  if (path === '/profile-reviews/me') { await db.meta.put({ key: `${account}:reference:/profile-reviews/me`, value: data }); await mergeRows('profileReviews', data.requests || [], account); }
  if (path.split('?')[0] === '/profile-reviews') await mergeRows('profileReviews', data.data || [], account);
  const segments = path.split('?')[0].split('/').filter(Boolean);
  const root = (path === '/students/accounts' ? 'studentAccounts' : segments[0] === 'schedules' ? { media: 'mediaPlans', duties: 'teacherDuties', teachers: 'dutyTeachers' }[segments[1]] : segments[0]) as EntityTable;
  if (entityTables.includes(root)) {
    const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data?.id ? [data] : [];
    await mergeRows(root, rows, account);
  }
}
export function responseKey(account: string, path: string, params: any) {
  return JSON.stringify([account, path, Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b))]);
}
export async function localWrite(method: string, path: string, data: any): Promise<any | undefined> {
  if (path === '/notifications/broadcast' && method === 'post') {
    const actor = readActiveIdentity();
    if (actor?.role !== 'ADMIN') throw Object.assign(new Error('إرسال الإشعارات متاح للإدارة فقط'), { localWriteRejected: true });
    return save('notifications', { ...data, pendingDelete: 1 }, 'broadcast');
  }
  const parts = path.split('/').filter(Boolean);
  if (method === 'post' && path === '/profile-reviews' || method === 'patch' && path === '/students/me/questionnaire' || method === 'patch' && parts[0] === 'teachers' && readActiveIdentity()?.role === 'TEACHER') {
    const user = readActiveIdentity();
    if (!user || !['STUDENT', 'TEACHER'].includes(user.role)) throw Object.assign(new Error('طلب التحقق للطالب والمحفظ فقط'), { localWriteRejected: true });
    if ((await get('profileReviews')).some(row => row.status === 'PENDING')) throw Object.assign(new Error('لديك طلب بانتظار المراجعة'), { localWriteRejected: true });
    return save('profileReviews', { kind: user.role, requesterId: user.id, patch: path === '/profile-reviews' ? data.patch : data, status: 'PENDING', createdAt: new Date().toISOString() }, 'create');
  }
  if (method === 'patch' && parts[0] === 'profile-reviews' && parts[2] === 'decision') {
    const user = readActiveIdentity();
    if (user?.role !== 'ADMIN') throw Object.assign(new Error('المراجعة للإدارة فقط'), { localWriteRejected: true });
    const pending = await db.queue.where('accountId').equals(accountId()).filter(op => op.table === 'profileReviews' && op.entityId === parts[1]).first();
    if (pending && !pending.error) throw Object.assign(new Error('لديك قرار بانتظار المزامنة'), { localWriteRejected: true });
    return save('profileReviews', { ...data, id: parts[1] }, 'decision');
  }
  if (parts[0] === 'users' && (method === 'post' && parts.length === 1 || method === 'patch' && parts.length <= 3 && (!parts[2] || parts[2] === 'reset-password'))) {
    const user = readActiveIdentity();
    if (user?.role !== 'ADMIN') throw Object.assign(new Error('إدارة الحسابات متاحة للإدارة فقط'), { localWriteRejected: true });
    return save('users', { ...data, ...(parts[1] ? { id: parts[1] } : {}), credentialPending: true, ...(method === 'post' ? { activationPending: true } : {}) },
      method === 'post' ? 'create' : parts[2] === 'reset-password' ? 'reset-password' : 'update');
  }
  if (parts[0] === 'students' && parts[2] === 'account' && method === 'post' &&
      (parts.length === 3 || parts.length === 4 && parts[3] === 'reset-password')) {
    const user = readActiveIdentity();
    if (user?.role !== 'ADMIN') throw Object.assign(new Error('إدارة الحسابات متاحة للإدارة فقط'), { localWriteRejected: true });
    const student = (await get('students')).find(row => row.id === parts[1]);
    const existing = (await get('studentAccounts')).find(row => row.id === parts[1]);
    if (!student && !existing) throw Object.assign(new Error('نزّل ملف الطالب مرة واحدة قبل إدارة حسابه بدون نت'), { localWriteRejected: true });
    if (parts.length === 3 && existing) throw Object.assign(new Error('الطالب لديه حساب أو طلب إنشاء حساب محفوظ بالفعل'), { localWriteRejected: true });
    if (parts[3] && !existing) throw Object.assign(new Error('الطالب لا يملك حساب دخول محفوظًا على هذا الجهاز'), { localWriteRejected: true });
    const password = generateTemporaryPassword();
    const details = existing || student!;
    const row = await save('studentAccounts', { id: parts[1], studentId: parts[1], fullName: details.fullName,
      code: details.code, nationalId: details.nationalId, username: existing?.username || details.code?.toLowerCase(),
      isActive: true, mustChangePassword: true, password, credentialPending: true, activationPending: parts.length === 3 },
      parts.length === 3 ? 'create' : 'reset-password');
    return { ...row, temporaryPassword: password };
  }
  if (parts[0] === 'schedules' && ['media', 'duties'].includes(parts[1])) {
    const table = parts[1] === 'media' ? 'mediaPlans' : 'teacherDuties';
    if (method === 'post' && parts.length === 2) return save(table, data);
    if (method === 'patch' && parts.length === 3) return update(table, parts[2], data);
    if (method === 'delete' && parts.length === 3) return remove(table, parts[2]);
  }
  let table = parts[0] as EntityTable; let id = parts[1]; let action: string | undefined;
  if (table === 'students' && parts[2] === 'notes' && method === 'post') return save('behaviors', { ...data, studentId: id });
  if (table === 'students' && id === 'bulk-delete' && method === 'post' && Array.isArray(data?.ids)) { for (const rowId of data.ids) await remove('students', rowId); return { deleted: data.ids.length }; }
  if (table === 'notifications' && id === 'read-all' && method === 'patch') { for (const row of await get('notifications')) if (!row.isRead) await save('notifications', { id: row.id, isRead: true }, 'read'); return { message: 'تم تعليم الإشعارات كمقروءة محليًا' }; }
  if (table === 'notifications' && parts[2] === 'read' && method === 'patch') return save('notifications', { id, isRead: true }, 'read');
  if (table === 'exams' && id === 'requests' && parts.length === 2 && method === 'post') { table = 'examRequests'; id = ''; }
  else if (table === 'exams' && parts[2] === 'result' && method === 'patch') action = 'result';
  else if (parts.length > 2) return undefined;
  if (!['students', 'circles', 'teachers', 'recitations', 'attendance', 'exams', 'examRequests', 'notifications', 'courses'].includes(table)) return undefined;
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  if (method === 'post' && !id) {
    if (table === 'students' && data?.createAccount) {
      const password = generateTemporaryPassword();
      const saved = await save(table, { ...data, accountPassword: password });
      return { ...saved, accountCredentials: { username: data.code || 'يُحدّد بعد المزامنة', temporaryPassword: password } };
    }
    return save(table, data || {});
  }
  if (method === 'patch' && id) return action ? save(table, { ...data, id }, action) : update(table, id, data || {});
  if (method === 'delete' && id) return remove(table, id);
  return undefined;
}
