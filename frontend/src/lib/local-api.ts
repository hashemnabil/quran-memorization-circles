import { db, entityTables, type EntityTable } from './db';
import { accountId, get, mergeRows, remove, save, update } from './offline-engine';

export async function localRead(path: string, params: Record<string, any> = {}): Promise<any | undefined> {
  const url = new URL(path, 'https://local.invalid');
  url.searchParams.forEach((value, key) => { params[key] ??= value; });
  const segments = url.pathname.split('/').filter(Boolean);
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
    if (params.search && ![row.fullName, row.name, row.code, row.nationalId, row.guardianName, row.guardianPhone, row.phone, row.user?.fullName].filter(Boolean).join(' ').toLocaleLowerCase().includes(String(params.search).toLocaleLowerCase())) return false;
    for (const field of ['status', 'evaluation', 'circleId', 'studentId', 'teacherId', 'type', 'gender', 'isActive']) {
      const value = params[field]; if (value === '' || value === undefined) continue;
      const actual = field === 'circleId' ? row.circleId ?? row.circle?.id : row[field];
      if (String(actual) !== String(value)) return false;
    }
    if (params.unreadOnly === true || params.unreadOnly === 'true') if (row.isRead) return false;
    if (params.track === 'CIRCLE' && !(row.circleId || row.circle?.id)) return false;
    if (params.track === 'ACTIVITY' && row.status !== 'ACTIVITY') return false;
    if (params.track === 'COURSE' && !row.courses?.length && !row.courseEnrollments?.length) return false;
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
  const segments = path.split('?')[0].split('/').filter(Boolean);
  const root = (segments[0] === 'schedules' ? { media: 'mediaPlans', duties: 'teacherDuties', teachers: 'dutyTeachers' }[segments[1]] : segments[0]) as EntityTable;
  if (entityTables.includes(root)) {
    const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data?.id ? [data] : [];
    await mergeRows(root, rows, account);
  }
}
export function responseKey(account: string, path: string, params: any) {
  return JSON.stringify([account, path, Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b))]);
}
export async function localWrite(method: string, path: string, data: any): Promise<any | undefined> {
  const parts = path.split('/').filter(Boolean);
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
  if (method === 'post' && !id) return save(table, data || {});
  if (method === 'patch' && id) return action ? save(table, { ...data, id }, action) : update(table, id, data || {});
  if (method === 'delete' && id) return remove(table, id);
  return undefined;
}
