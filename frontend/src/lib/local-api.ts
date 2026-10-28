import { readActiveIdentity } from './active-identity';
import { db, entityTables, type EntityTable } from './db';
import { accountId, get, mergeRows, remove, save, update } from './offline-engine';
import { readLocalSupport, writeLocalSupport } from './local-support';
import { localConversation, createLocalConversation } from './local-conversations';
import { cacheConversations } from './conversation-cache';
import { queueCertificateDraft } from './local-certificates';

export async function cancelRejectedMessageChange(messageId: string) {
  const account = accountId();
  await db.transaction('rw', db.queue, db.table('chatMessages'), async () => {
    const operations = await db.queue.where('accountId').equals(account).filter(op => op.table === 'chatMessages' && op.entityId === messageId).toArray();
    const op = operations[0];
    if (operations.length !== 1 || !op.error || !['update', 'delete'].includes(op.action)) throw new Error('يمكن إلغاء تعديل أو حذف رفضه الخادم فقط');
    await db.table('chatMessages').update([account, messageId], { body: op.data.previousBody, editedAt: op.data.previousEditedAt, synced: 1, pendingDelete: 0 });
    await db.queue.delete(op.id!);
  });
  window.dispatchEvent(new Event('halaqat:changed'));
}

export async function localRead(path: string, params: Record<string, any> = {}): Promise<any | undefined> {
  if (path.split('?')[0].startsWith('/support')) return readLocalSupport(path, params);
  if (path.split('?')[0] === '/profile-reviews') { const kind = new URL(path, 'https://local.invalid').searchParams.get('kind') || params.kind; const data = (await get('profileReviews')).filter(row => !kind || row.kind === kind).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); const queue = await db.queue.where('accountId').equals(accountId()).filter(op => op.table === 'profileReviews').toArray(); return { data: data.map(row => ({ ...row, syncError: queue.find(op => op.entityId === row.id)?.error })), meta: { total: data.length, hasNextPage: false } }; }
  if (path === '/profile-reviews/me') {
    const account = accountId(); const reference = (await db.meta.get(`${account}:reference:/profile-reviews/me`))?.value;
    if (reference) return { ...reference, requests: (await get('profileReviews')).filter(row => row.requesterId === account).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) };
  }
  const url = new URL(path, 'https://local.invalid');
  url.searchParams.forEach((value, key) => { params[key] ??= value; });
  const segments = url.pathname.split('/').filter(Boolean);
  if (['students','courses','circles','teachers','exams','recitations','media-activities','transfers','suspensions','preparations'].includes(segments[0]) && /^[0-9a-f-]{36}$/i.test(segments[1] || '')) segments[1] = (await db.meta.get(`${accountId()}:id:${segments[1]}`))?.value || segments[1];
  if (segments[0] === 'chat' && segments[1] === 'conversations') {
    if (segments[2]) segments[2] = (await db.meta.get(`${accountId()}:id:${segments[2]}`))?.value || segments[2];
    if (segments.length <= 3) return localConversation(url.pathname);
  }
  if (url.pathname === '/settings' || url.pathname === '/settings/public') {
    const rows = await get('schoolSettings');
    if (rows.length) return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    return undefined;
  }
  if (url.pathname === '/settings/donations') {
    const settings = (await get('schoolSettings')).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (!settings) return undefined;
    return Object.fromEntries(['donationsEnabled','donationTitle','donationDescription','donationGoalAmount','donationRaisedAmount','donationCurrency','donationMethod','donationLink','donationBankPalestine','donationIslamicBank','donationJawwal','donationPalPay'].map(key => [key, settings[key]]));
  }
  if (url.pathname === '/community/users/' + accountId()) {
    return (await get('accountPreferences')).find(row=>row.id===accountId()) || (await db.responses.get(responseKey(accountId(),path,params)))?.data;
  }
  if (url.pathname === '/community/feed') {
    const posts=(await get('communityPosts')).filter(row=>(!params.userId || row.authorId===params.userId && !row.schoolPost) && (params.school!=='true' || row.schoolPost)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    const comments=await get('communityComments');
    return posts.map(post=>{const rows=[...(post.comments||[])];for(const comment of comments.filter(row=>row.postId===post.id)) { const index=rows.findIndex(row=>row.id===comment.id); if(index<0)rows.push(comment);else rows[index]=comment; }return {...post,comments:rows,_count:{likes:post._count?.likes||0,comments:Math.max(post._count?.comments||0,rows.length)}};});
  }
  if (segments[0] === 'chat' && segments[1]==='conversations' && segments[3]==='messages') {
      const errors = await db.queue.where('accountId').equals(accountId()).filter(op => op.table === 'chatMessages' && !!op.error).toArray();
      const rows=(await db.table('chatMessages').where('accountId').equals(accountId()).toArray()).filter(row=>row.conversationId===segments[2] && (!row.pendingDelete || errors.some(op=>op.entityId===row.id)))
        .map(row=>({...row,syncError:errors.find(op=>op.entityId===row.id)?.error,rejectedChange:errors.some(op=>op.entityId===row.id && ['update','delete'].includes(op.action))})).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    const limit=Math.max(1,Number(params.limit)||100), page=Math.max(1,Number(params.page)||1);
    return {data:rows.slice(Math.max(0,rows.length-page*limit), rows.length-(page-1)*limit),meta:{total:rows.length,page,limit,hasNextPage:rows.length>page*limit}};
  }
  if (segments[0] === 'courses' && segments[2] === 'attendance' && segments[3] === 'sheet') {
    const cached = await db.responses.get(responseKey(accountId(), path, params));
    if (!cached) return undefined;
    const sheet = structuredClone(cached.data);
    const pending = (await get('courseAttendance')).filter(row => row.courseId === segments[1] && row.date === String(params.date || '').slice(0, 10) && Array.isArray(row.entries));
    for (const batch of pending) for (const entry of batch.entries) {
      const student = sheet.students?.find((row: any) => row.id === entry.studentId);
      if (student) student.attendance = { ...entry, pending: true };
    }
    sheet.alreadyRecorded ||= pending.length > 0;
    sheet.canSubmit = !sheet.alreadyRecorded;
    return sheet;
  }
  if (segments[0] === 'staff-attendance') {
    const account = accountId();
    if (segments[1] === 'sheet') {
      const cached = await db.responses.get(responseKey(account, '/staff-attendance/sheet', params));
      if (!cached) return undefined;
      const sheet = structuredClone(cached.data);
      const date = String(params.date || '').slice(0, 10);
      const pending = (await get('staffAttendance')).filter(row => row.date === date && Array.isArray(row.entries));
      for (const batch of pending) for (const entry of batch.entries) {
        const person = sheet.staff?.find((row: any) => row.id === entry.userId);
        if (person) person.attendance = { ...entry, userId: entry.userId, date, pending: true };
      }
      sheet.alreadyRecorded ||= pending.length > 0;
      sheet.canSubmit = !sheet.alreadyRecorded;
      return sheet;
    }
    if (segments[1] === 'history' && segments.length === 3) {
      const date = segments[2];
      const cached = await db.responses.get(responseKey(account, path, params));
      if (!cached) return undefined;
      const pending = (await get('staffAttendance')).filter(row => row.date === date && Array.isArray(row.entries));
      return { ...cached.data, records: [...(cached.data.records || []), ...pending.flatMap(batch => batch.entries.map((entry: any) => ({ ...entry, date, pending: true }))) ] };
    }
  }
  if (url.pathname === '/certificates/requests/mine') return (await get('certificateRequests')).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (url.pathname === '/certificates/requests') return (await get('certificateRequests')).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (url.pathname === '/certificates/mine' || url.pathname === '/certificates/issued') return (await get('certificates')).sort((a,b) => String(b.issuedAt).localeCompare(String(a.issuedAt)));
  if (url.pathname === '/certificates/templates') return get('certificateTemplates');
  if (url.pathname === '/announcements/active') {
    const role = readActiveIdentity()?.role;
    const now = Date.now();
    return (await get('announcements')).filter(row => row.isActive && (!row.publishedAt || new Date(row.publishedAt).getTime() <= now) && (!row.expiresAt || new Date(row.expiresAt).getTime() > now) && (!row.audience?.length || row.audience.includes(role)))
      .sort((a,b) => String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt))).slice(0,10);
  }
  if (url.pathname === '/media-activities') {
    const from = params.from || url.searchParams.get('from'), to = params.to || url.searchParams.get('to');
    return (await get('mediaActivities')).filter(row => (!from || String(row.activityDate).slice(0,10) >= from) && (!to || String(row.activityDate).slice(0,10) <= to))
      .sort((a,b) => String(b.activityDate).localeCompare(String(a.activityDate))).slice(0,500);
  }
  if (url.pathname === '/preparations') {
    let rows = await get('preparations');
    if (params.studentId) rows = rows.filter(row => row.studentId === params.studentId);
    if (params.circleId) rows = rows.filter(row => row.student?.circle?.id === params.circleId || row.circleId === params.circleId);
    if (params.pending === true || params.pending === 'true') rows = rows.filter(row => !row.completedAt);
    rows.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const page = Math.max(1, Number(params.page) || 1), limit = Math.max(1, Number(params.limit) || 20);
    return { data: rows.slice((page-1)*limit,page*limit), meta: { page, limit, total: rows.length, totalPages: Math.max(1,Math.ceil(rows.length/limit)), hasNextPage: page*limit < rows.length, hasPreviousPage: page > 1 } };
  }
  if (segments[0] === 'students' && segments[2] === 'surahs') return (await get('surahCompletions')).filter(row => row.studentId === segments[1]);
  if (url.pathname === '/attendance/absence-permissions') return (await get('absencePermissions')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  if (url.pathname === '/attendance/summons') return (await get('guardianSummons')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  if (url.pathname === '/suspensions/active') return (await get('suspensions')).filter(row => row.status === 'APPROVED' && !row.returnedAt);
  if (['/meetings','/examCommittees'].includes(url.pathname)) return (await get(segments[0] as EntityTable)).sort((a,b) => String(b.heldAt).localeCompare(String(a.heldAt)));
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
    for (const permission of await get('absencePermissions')) if (permission.status === 'APPROVED' && String(permission.date).slice(0, 10) === params.date && students.some(student => student.id === permission.studentId) && !attendance.some(row => row.studentId === permission.studentId)) attendance.push({ id: `permission:${permission.id}`, studentId: permission.studentId, circleId: circle.id, date: permission.date, status: 'EXCUSED', note: permission.reason, createdAt: permission.decidedAt || permission.updatedAt } as any);
    const complete = students.length > 0 && students.every(student => attendance.some(entry => entry.studentId === student.id));
    return { circle, date: params.date, alreadyRecorded: complete, canSubmit: !complete, submittedAt: null, submittedBy: null,
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
    for (const field of ['status', 'evaluation', 'circleId', 'studentId', 'teacherId', 'type', 'gender', 'isActive', 'role', 'kind', 'committeeId']) {
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
  if (path.split('?')[0] === '/media-activities' && Array.isArray(data)) await mergeRows('mediaActivities', data, account);
  if (path === '/chat/conversations' && Array.isArray(data)) await cacheConversations(account, data, true);
  if (/^\/chat\/conversations\/[^/]+$/.test(path) && data?.id) await cacheConversations(account, [data]);
  if (path === '/support') await mergeRows('supportTickets', data?.data || [], account);
  if (/^\/support\/[^/]+$/.test(path) && data?.id) await mergeRows('supportTickets', [data], account);
  if (/^\/chat\/conversations\/[^/]+\/messages$/.test(path)) await mergeRows('chatMessages', data?.data||[], account);
  if (path==='/community/feed') { await mergeRows('communityPosts',data||[],account); await mergeRows('communityComments',(data||[]).flatMap((post:any)=>(post.comments||[]).map((comment:any)=>({...comment,postId:post.id}))),account); }
  if (path==='/community/users/'+account) await mergeRows('accountPreferences',[data],account);
  if (path === '/profile-reviews/me') { await db.meta.put({ key: `${account}:reference:/profile-reviews/me`, value: data }); await mergeRows('profileReviews', data.requests || [], account); }
  if (path.split('?')[0] === '/profile-reviews') await mergeRows('profileReviews', data.data || [], account);
  const segments = path.split('?')[0].split('/').filter(Boolean);
  const root = (segments[0] === 'settings' ? 'schoolSettings' : segments[0]==='exams'&&segments[1]==='requests'?'examRequests':segments[0]==='attendance'&&segments[1]==='absence-permissions'?'absencePermissions':segments[0]==='attendance'&&segments[1]==='summons'?'guardianSummons':path === '/students/accounts' ? 'studentAccounts' : segments[0] === 'schedules' ? { media: 'mediaPlans', duties: 'teacherDuties', teachers: 'dutyTeachers' }[segments[1]] : segments[0]) as EntityTable;
  if (entityTables.includes(root)) {
    const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data?.id ? [data] : [];
    await mergeRows(root, rows, account);
  }
}
export function responseKey(account: string, path: string, params: any) {
  return JSON.stringify([account, path, Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b))]);
}
export async function localWrite(method: string, path: string, data: any): Promise<any | undefined> {
  if (path.startsWith('/support')) return writeLocalSupport(method, path, data);
  const route = path.split('/').filter(Boolean);
  if (route[0] === 'chat' && route[1] === 'conversations' && route.length === 3 && ['direct', 'group'].includes(route[2]) && method === 'post') return createLocalConversation(route[2], data);
  if (route[0] === 'chat' && route[1] === 'conversations' && route[2] && !['direct', 'group'].includes(route[2])) route[2] = (await db.meta.get(`${accountId()}:id:${route[2]}`))?.value || route[2];
  if (route[0] === 'chat' && route[1] === 'conversations' && route[3] === 'read' && method === 'patch') {
    const draft = await localConversation('/chat/conversations/' + route[2]);
    if (draft?.synced === 0) return { ...draft, unreadCount: 0 };
  }
  if (route[0] === 'chat' && route[1] === 'conversations' && route[3] === 'messages' && route.length === 5 && ['patch', 'delete'].includes(method)) {
    const actor = readActiveIdentity();
    const message = (await get('chatMessages')).find(row => row.id === route[4] && row.conversationId === route[2]);
    const detail = (await db.responses.get(responseKey(accountId(), '/chat/conversations/' + route[2], undefined)))?.data;
    if (!actor || !message || !detail) throw Object.assign(new Error('حمّل الرسالة والمحادثة قبل تعديلها دون اتصال'), { localWriteRejected: true });
    if (message.synced === 0) throw Object.assign(new Error('انتظر مزامنة التغيير السابق على الرسالة'), { localWriteRejected: true });
    const mine = (message.senderId || message.sender?.id) === actor.id;
    if (method === 'patch' && (!mine || detail.canPost === false) || method === 'delete' && !mine && !detail.isAdmin && actor.role !== 'ADMIN')
      throw Object.assign(new Error('لا تملك صلاحية تعديل هذه الرسالة'), { localWriteRejected: true });
    if (method === 'patch' && (typeof data?.body !== 'string' || !data.body.trim() || data.body.length > 4000)) throw Object.assign(new Error('نص الرسالة غير صالح'), { localWriteRejected: true });
    return save('chatMessages', { id: message.id, conversationId: route[2], previousBody: message.body, previousEditedAt: message.editedAt || null,
      ...(method === 'patch' ? { body: data.body.trim(), editedAt: new Date().toISOString() } : { pendingDelete: 1 }) }, method === 'patch' ? 'update' : 'delete');
  }
  if (route[0]==='chat' && route[1]==='conversations' && route[3]==='messages' && route.length===4 && method==='post') {
    const actor=readActiveIdentity();
      const detail=await localConversation('/chat/conversations/'+route[2]) || (await db.responses.get(responseKey(accountId(),'/chat/conversations/'+route[2],undefined)))?.data;
    if(!actor || !detail || detail.canPost===false) throw Object.assign(new Error('نزّل المحادثة المسموح بها قبل إرسال رسائل دون اتصال'),{localWriteRejected:true});
    if(typeof data?.body!=='string'||!data.body.trim()||data.body.length>4000)throw Object.assign(new Error('نص الرسالة غير صالح'),{localWriteRejected:true});
    return save('chatMessages',{conversationId:route[2],body:data.body.trim(),sender:actor,createdAt:new Date().toISOString()},'create');
  }
  if (path==='/community/nickname' && method==='patch') {
    if(typeof data?.nickname!=='string'||data.nickname.length>60)throw Object.assign(new Error('الكنية غير صالحة'),{localWriteRejected:true});
    return save('accountPreferences',{id:accountId(),nickname:data.nickname.trim()},'update');
  }
  if (path==='/community/posts' && method==='post') {
    const actor=readActiveIdentity();if(!actor || data.schoolPost&&actor.role!=='ADMIN')throw Object.assign(new Error('النشر باسم المدرسة للإدارة فقط'),{localWriteRejected:true});
    if(typeof data?.body!=='string'||!data.body.trim()||data.body.length>2000)throw Object.assign(new Error('المنشور غير صالح'),{localWriteRejected:true});
    return save('communityPosts',{body:data.body.trim(),schoolPost:!!data.schoolPost,authorId:actor.id,author:actor,comments:[],likes:[],_count:{likes:0,comments:0},createdAt:new Date().toISOString()},'create');
  }
  if (route[0]==='community' && route[1]==='posts' && route.length===3 && method==='delete') {
    const post=(await get('communityPosts')).find(row=>row.id===route[2]);const actor=readActiveIdentity();
    if(!post || post.authorId!==actor?.id && actor?.role!=='ADMIN')throw Object.assign(new Error('لا تملك صلاحية حذف المنشور'),{localWriteRejected:true});
    return remove('communityPosts',route[2]);
  }
  if (route[0]==='community' && route.length===4 && method==='post' && (route[1]==='posts'&&route[3]==='comments'||route[1]==='comments'&&route[3]==='replies')) {
    if(typeof data?.body!=='string'||!data.body.trim()||data.body.length>500)throw Object.assign(new Error('التعليق غير صالح'),{localWriteRejected:true});
    const parent=route[1]==='comments'?(await get('communityComments')).find(row=>row.id===route[2]):null;
    const postId=parent?.postId||route[2];
    if(route[1]==='comments'&&!parent || !(await get('communityPosts')).some(row=>row.id===postId))throw Object.assign(new Error('نزّل المنشور والتعليق قبل كتابة رد دون اتصال'),{localWriteRejected:true});
    return save('communityComments',{body:data.body.trim(),postId,parentId:parent?.id||null,user:readActiveIdentity(),createdAt:new Date().toISOString(),_count:{likes:0}},'create');
  }
  if (method === 'patch' && path === '/settings') {
    if (readActiveIdentity()?.role !== 'ADMIN') throw Object.assign(new Error('تعديل إعدادات الحملة متاح للإدارة فقط'), { localWriteRejected: true });
    const allowed = ['name','mosqueName','logoUrl','phone','email','address','about','facebook','twitter','instagram','youtube','telegram','whatsapp','website','academicYear','donationsEnabled','donationTitle','donationDescription','donationGoalAmount','donationRaisedAmount','donationCurrency','donationMethod','donationLink','donationBankPalestine','donationIslamicBank','donationJawwal','donationPalPay'];
    const payload = Object.fromEntries(allowed.filter(key => data?.[key] !== undefined).map(key => [key, data[key]]));
    const rows = await get('schoolSettings');
    const current = rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    const cached = (await db.responses.where('accountId').equals(accountId()).toArray()).find(item => {
      try { const [, cachedPath] = JSON.parse(item.key); return cachedPath === '/settings' || cachedPath === '/settings/public'; } catch { return false; }
    })?.data;
    return save('schoolSettings', { ...(cached || {}), ...(current || {}), ...payload, id: current?.synced === 0 ? current.id : crypto.randomUUID() }, 'update');
  }
  if (method === 'post' && route[0] === 'courses' && route[2] === 'attendance' && route.length === 3) {
    const actor = readActiveIdentity();
    if (!['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(actor?.role || '') || !data?.date || !Array.isArray(data.entries) || !data.entries.length) throw Object.assign(new Error('سجّل حضور الطلاب في الدورة بشكل صحيح'), { localWriteRejected: true });
    const courseId = route[1], date = String(data.date).slice(0, 10);
    const snapshots = await db.responses.where('accountId').equals(accountId()).toArray();
    const cached = snapshots.find(item => {
      try { const [, cachedPath, cachedParams] = JSON.parse(item.key); return cachedPath === `/courses/${courseId}/attendance/sheet` && cachedParams.some(([key, value]: [string, any]) => key === 'date' && String(value).slice(0, 10) === date); } catch { return false; }
    });
    const known = new Set((cached?.data?.students || []).map((row: any) => row.id));
    if (!known.size || data.entries.some((entry: any) => !known.has(entry.studentId) || !['PRESENT', 'ABSENT', 'EXCUSED'].includes(entry.status))) throw Object.assign(new Error('نزّل كشف طلاب الدورة قبل تسجيل الحضور دون اتصال'), { localWriteRejected: true });
    const existing = (await get('courseAttendance')).find(row => row.courseId === courseId && row.date === date && Array.isArray(row.entries));
    return save('courseAttendance', { courseId, date, entries: data.entries, ...(existing ? { id: existing.id } : {}), createdAt: new Date().toISOString() }, 'create');
  }
  if (route[0] === 'courses' && route[2] === 'students' && (method === 'post' && route.length === 3 || method === 'delete' && route.length === 4)) {
    const actor = readActiveIdentity();
    if (!actor || !['ADMIN','SUPERVISOR'].includes(actor.role)) throw Object.assign(new Error('تسجيل الطلاب في الدورات متاح للإدارة والإشراف'), { localWriteRejected: true });
    const account = accountId();
    const courseId = (await db.meta.get(`${account}:id:${route[1]}`))?.value || route[1];
    const course = (await get('courses')).find(row => row.id === courseId);
    if (!course || !Array.isArray(course.students)) throw Object.assign(new Error('حمّل تفاصيل الدورة قبل تعديل تسجيل الطلاب دون اتصال'), { localWriteRejected: true });
    let students = [...course.students];
    if (method === 'post') {
      if (!Array.isArray(data?.studentIds) || !data.studentIds.length || data.studentIds.length > 200 || data.studentIds.some((id: any) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) throw Object.assign(new Error('اختر طلابًا صالحين للتسجيل'), { localWriteRejected: true });
      const ids = [...new Set<string>(data.studentIds)]; const known = await get('students');
      if (ids.some(id => !known.some(row => row.id === id))) throw Object.assign(new Error('حمّل الطلاب المحددين قبل تسجيلهم دون اتصال'), { localWriteRejected: true });
      for (const id of ids) {
        const student = known.find(row => row.id === id)!;
        const previous = students.find(row => row.id === id);
        const pending = { id, fullName: student.fullName, code: student.code, phone: student.phone, guardianPhone: student.guardianPhone, nationalId: student.nationalId, birthDate: student.birthDate,
          enrollmentId: previous?.enrollmentId || crypto.randomUUID(), enrolledAt: previous?.enrolledAt || new Date().toISOString(), endedAt: null, isCurrent: true, pending: true };
        students = [...students.filter(row => row.id !== id), pending];
      }
      if (accountId() !== account) throw new Error('تغيّر الحساب؛ لم يُحفظ طلب التسجيل');
      return save('courses', { id: courseId, studentIds: ids, students, studentsCount: students.filter(row => row.isCurrent).length, enrollmentPending: true }, 'enroll');
    }
    if (!students.some(row => row.id === route[3] && row.isCurrent)) throw Object.assign(new Error('الطالب غير مسجل في النسخة المحلية للدورة'), { localWriteRejected: true });
    students = students.map(row => row.id === route[3] ? { ...row, endedAt: new Date().toISOString(), isCurrent: false, pending: true } : row);
    if (accountId() !== account) throw new Error('تغيّر الحساب؛ لم يُحفظ طلب إنهاء التسجيل');
    return save('courses', { id: courseId, studentId: route[3], students, studentsCount: students.filter(row => row.isCurrent).length, enrollmentPending: true }, 'unenroll');
  }
  if (method === 'post' && route[0] === 'staff-attendance' && route.length === 1) {
    const actor = readActiveIdentity();
    if (!['ADMIN', 'SUPERVISOR'].includes(actor?.role || '') || !data?.date || !Array.isArray(data.entries) || !data.entries.length) throw Object.assign(new Error('سجّل حضورًا صحيحًا للكادر قبل الحفظ'), { localWriteRejected: true });
    const date = String(data.date).slice(0, 10);
    const cachedSheets = await db.responses.where('accountId').equals(accountId()).toArray();
    const staff = cachedSheets.find(item => {
      try { const [, cachedPath, cachedParams] = JSON.parse(item.key); return cachedPath === '/staff-attendance/sheet' && cachedParams.some(([key, value]: [string, any]) => key === 'date' && String(value).slice(0, 10) === date); } catch { return false; }
    });
    const known = new Set((staff?.data?.staff || []).map((row: any) => row.id));
    if (data.entries.some((entry: any) => !known.has(entry.userId) || !['PRESENT', 'ABSENT', 'EXCUSED'].includes(entry.status))) throw Object.assign(new Error('نزّل كشف حضور الكادر قبل حفظه دون اتصال'), { localWriteRejected: true });
    const existing = (await get('staffAttendance')).find(row => row.date === date && Array.isArray(row.entries));
    return save('staffAttendance', { date, entries: data.entries, ...(existing ? { id: existing.id } : {}), createdAt: new Date().toISOString() }, 'create');
  }
  if (route[0] === 'certificates') {
    const actor = readActiveIdentity();
    if (method === 'post' && path === '/certificates/issue') return queueCertificateDraft('issue', data);
    if (method === 'post' && path === '/certificates/monthly-reports/issue') return queueCertificateDraft('publish-monthly-report', data);
    if (route[1] === 'requests' && method === 'post' && route.length === 2) {
      if (actor?.role !== 'STUDENT') throw Object.assign(new Error('طلب الملف متاح للطالب'), { localWriteRejected: true });
      const student = (await get('students')).find(row => row.selfAccountId === actor.id);
      if (!student) throw Object.assign(new Error('حمّل ملف الطالب مرة واحدة قبل طلب شهادة دون اتصال'), { localWriteRejected: true });
      if (!data?.kind) throw Object.assign(new Error('اختر نوع الطلب'), { localWriteRejected: true });
      return save('certificateRequests', { ...data, studentId: student.id, student: { id: student.id, fullName: student.fullName, code: student.code }, status: 'PENDING', createdAt: new Date().toISOString() }, 'create');
    }
    if (route[1] === 'requests' && route[3] === 'decision' && method === 'patch') {
      if (actor?.role !== 'ADMIN') throw Object.assign(new Error('البت بطلبات الشهادات متاح للإدارة'), { localWriteRejected: true });
      const request = (await get('certificateRequests')).find(row => row.id === route[2]);
      if (!request) throw Object.assign(new Error('حمّل طلب الشهادة قبل البت به دون اتصال'), { localWriteRejected: true });
      return save('certificateRequests', { ...data, id: request.id, pendingDecision: true }, 'decision');
    }
    if (route[1] === 'templates' && method === 'post' && route.length === 2) {
      if (actor?.role !== 'ADMIN') throw Object.assign(new Error('إدارة قوالب الشهادات متاحة للإدارة'), { localWriteRejected: true });
      if (!data?.name || !data?.kind || !data?.design) throw Object.assign(new Error('بيانات قالب الشهادة غير مكتملة'), { localWriteRejected: true });
      return save('certificateTemplates', { ...data, isActive: true, createdById: actor.id }, 'create');
    }
    if (route[1] === 'templates' && route[3] === 'deactivate' && method === 'patch') {
      if (actor?.role !== 'ADMIN') throw Object.assign(new Error('إدارة قوالب الشهادات متاحة للإدارة'), { localWriteRejected: true });
      return save('certificateTemplates', { id: route[2], isActive: false }, 'deactivate');
    }
  }
  if (route[0] === 'announcements') {
    if (readActiveIdentity()?.role !== 'ADMIN') throw Object.assign(new Error('إدارة الإعلانات متاحة للإدارة فقط'), { localWriteRejected: true });
    if (method === 'post' && route.length === 1) {
      if (!String(data?.title || '').trim()) throw Object.assign(new Error('عنوان الإعلان مطلوب'), { localWriteRejected: true });
      return save('announcements', { ...data, title: data.title.trim(), audience: data.audience || [], isActive: data.isActive ?? true, publishedAt: new Date().toISOString(), createdBy: readActiveIdentity() }, 'create');
    }
    if (method === 'patch' && route.length === 2) return update('announcements', route[1], data);
    if (method === 'delete' && route.length === 2) return remove('announcements', route[1]);
  }
  if (route[0] === 'media-activities') {
    if (!['ADMIN','SUPERVISOR'].includes(readActiveIdentity()?.role || '')) throw Object.assign(new Error('إدارة الأنشطة متاحة للإدارة والإشراف'), { localWriteRejected: true });
    if (method === 'post' && route.length === 1 || method === 'patch' && route.length === 2) {
      if (!data?.title?.trim() || !data?.description?.trim() || !data?.activityDate || !data?.type) throw Object.assign(new Error('أكمل بيانات النشاط الإعلامي قبل الحفظ'), { localWriteRejected: true });
      if (!['REPORT_FILLING','PHOTOGRAPHY','PUBLISHING','EDITING','DESIGN'].includes(data.type) || !Number.isFinite(Date.parse(data.activityDate)) || data.workUrl && !/^https?:\/\//i.test(data.workUrl.trim())) throw Object.assign(new Error('نوع النشاط أو تاريخه أو رابطه غير صالح'), { localWriteRejected: true });
      if (method === 'post') return save('mediaActivities', { ...data, title: data.title.trim(), description: data.description.trim(), workUrl: data.workUrl?.trim() || null, createdBy: readActiveIdentity() }, 'create');
      const current = (await get('mediaActivities')).find(row => row.id === route[1]);
      if (!current) throw Object.assign(new Error('حمّل النشاط قبل تعديله دون اتصال'), { localWriteRejected: true });
      const baseline = (row: any) => ({ type: row.type, title: row.title, description: row.description, activityDate: new Date(row.activityDate).toISOString(), workUrl: row.workUrl || null });
      return save('mediaActivities', { ...data, id: current.id, title: data.title.trim(), description: data.description.trim(), workUrl: data.workUrl?.trim() || null, previous: data.previous || baseline(current) }, 'update');
    }
    if (method === 'delete' && route.length === 2) {
      const current = (await get('mediaActivities')).find(row => row.id === route[1]);
      if (!current) throw Object.assign(new Error('حمّل النشاط قبل حذفه دون اتصال'), { localWriteRejected: true });
      return save('mediaActivities', { id: current.id, pendingDelete: 1, previous: { type: current.type, title: current.title, description: current.description, activityDate: new Date(current.activityDate).toISOString(), workUrl: current.workUrl || null } }, 'delete');
    }
  }
  if (route[0] === 'preparations') {
    const actor = readActiveIdentity();
    if (!actor || !['ADMIN','SUPERVISOR','TEACHER'].includes(actor.role)) throw Object.assign(new Error('لا تملك صلاحية تعديل التحضير'), { localWriteRejected: true });
    if (method === 'post' && route.length === 1) {
      const student = (await get('students')).find(row => row.id === data?.studentId);
      if (!student || !data.fromSurah || !data.toSurah || !data.fromAyah || !data.toAyah) throw Object.assign(new Error('بيانات التحضير غير مكتملة أو الطالب غير محفوظ محلياً'), { localWriteRejected: true });
      return save('preparations', { ...data, studentId: student.id, student: { id: student.id, fullName: student.fullName, code: student.code, circle: student.circle || null }, createdAt: new Date().toISOString() }, 'create');
    }
    if (route[1]) {
      const current = (await get('preparations')).find(row => row.id === route[1]);
      if (!current) throw Object.assign(new Error('حمّل سجل التحضير أولاً قبل تعديله دون اتصال'), { localWriteRejected: true });
      if (method === 'patch' && ['complete','reopen'].includes(route[2])) return save('preparations', { id: route[1], completedAt: route[2] === 'complete' ? new Date().toISOString() : null }, route[2]);
      if (method === 'patch' && route.length === 2) return update('preparations', route[1], data);
      if (method === 'delete' && route.length === 2) return remove('preparations', route[1]);
    }
  }
  if (route[0] === 'students' && route[2] === 'surahs' && route[1]) {
    const actor = readActiveIdentity();
    if (!actor || !['ADMIN','SUPERVISOR','TEACHER'].includes(actor.role)) throw Object.assign(new Error('تسجيل السور المكتملة متاح للكادر التعليمي'), { localWriteRejected: true });
    const student = (await get('students')).find(row => row.id === route[1]);
    if (!student) throw Object.assign(new Error('حمّل ملف الطالب قبل تعديل السور دون اتصال'), { localWriteRejected: true });
    if (method === 'post' && route.length === 3) {
      if (!data?.surah) throw Object.assign(new Error('اسم السورة مطلوب'), { localWriteRejected: true });
      if ((await get('surahCompletions')).some(row => row.studentId === student.id && row.surah === data.surah)) throw Object.assign(new Error('السورة مسجلة مكتملة مسبقاً'), { localWriteRejected: true });
      return save('surahCompletions', { ...data, studentId: student.id, recordedById: actor.id }, 'create');
    }
    if (method === 'delete' && route[3]) return save('surahCompletions', { id: route[3], studentId: student.id, pendingDelete: 1 }, 'delete');
  }
  if (route[0] === 'students' && route[2] === 'evaluation' && method === 'patch') {
    const actor = readActiveIdentity();
    if (!actor || !['ADMIN','SUPERVISOR','TEACHER'].includes(actor.role)) throw Object.assign(new Error('تعديل تقييم الطالب متاح للكادر التعليمي'), { localWriteRejected: true });
    const student = (await get('students')).find(row => row.id === route[1]);
    if (!student) throw Object.assign(new Error('حمّل ملف الطالب أولاً'), { localWriteRejected: true });
    return save('students', { id: student.id, evaluation: data.evaluation, note: data.note }, 'evaluation');
  }
  if (route[0] === 'attendance' && route[1] === 'absence-permissions') {
    const actor = readActiveIdentity();
    if (method === 'post' && route.length === 2) {
      if (!actor || actor.role !== 'STUDENT' || !data?.studentId || data.studentId !== actor.id || !data?.date || !String(data.reason || '').trim() || !Number.isInteger(data.durationMinutes) || data.durationMinutes < 1 || data.durationMinutes > 7) throw Object.assign(new Error('يقدم الطالب طلب الإذن لنفسه مع مدة من 1 إلى 7 أيام'), { localWriteRejected: true });
      const student = (await get('students')).find(row => row.id === data.studentId);
      if (!student) throw Object.assign(new Error('حمّل بيانات الطالب قبل تقديم طلب دون اتصال'), { localWriteRejected: true });
      return save('absencePermissions', { ...data, studentId: student.id, student, requesterId: actor.id, requester: { id: actor.id, fullName: actor.fullName, role: actor.role }, status: 'PENDING', createdAt: new Date().toISOString() }, 'create');
    }
    if (method === 'patch' && route.length === 4 && ['approve','reject'].includes(route[3])) {
      if (actor?.role !== 'ADMIN') throw Object.assign(new Error('قرار طلب الإذن متاح للإدارة فقط'), { localWriteRejected: true });
      const request = (await get('absencePermissions')).find(row => row.id === route[2]);
      if (!request || request.status !== 'PENDING') throw Object.assign(new Error('الطلب غير موجود أو سبق اتخاذ قرار فيه'), { localWriteRejected: true });
      return save('absencePermissions', { ...data, id: route[2], status: route[3] === 'approve' ? 'APPROVED' : 'REJECTED', decidedById: actor.id, decidedAt: new Date().toISOString(), pendingDecision: route[3] }, route[3]);
    }
  }
  if (route[0] === 'attendance' && route[1] === 'summons') {
    const actor = readActiveIdentity();
    if (actor?.role !== 'ADMIN') throw Object.assign(new Error('إرسال الاستدعاء متاح للإدارة فقط'), { localWriteRejected: true });
    if (method === 'post' && route.length === 2) {
      const student = (await get('students')).find(row => row.id === data?.studentId);
      if (!student || !data?.title?.trim() || !data?.body?.trim()) throw Object.assign(new Error('اختر طالبًا واكتب عنوان الاستدعاء ونصه'), { localWriteRejected: true });
      return save('guardianSummons', { ...data, student, issuedById: actor.id, createdAt: new Date().toISOString() }, 'create');
    }
  }
  if(method==='post'&&path==='/exams/historical') {
    if(readActiveIdentity()?.role!=='ADMIN')throw Object.assign(new Error('إدخال النتائج القديمة للإدارة فقط'),{localWriteRejected:true});
    const student=(await get('students')).find(row=>row.id===data.studentId);const committee=(await get('examCommittees')).find(row=>row.id===data.committeeId);const sections=(await db.meta.get(`${accountId()}:reference:/exams/sections`))?.value||[];const section=sections.find((row:any)=>row.id===data.sectionId);
    if(!student||!committee||!section)throw Object.assign(new Error('اختر الطالب واللجنة والمقرر'),{localWriteRejected:true});
    return save('exams',{...data,student,section,committee,scheduledAt:committee.heldAt,status:'COMPLETED',result:data.score>=80?'PASSED':'FAILED'},'historical');
  }
  if (method === 'post' && route[0] === 'exams' && route[1] === 'requests' && route[3] === 'schedule') {
    if (!['ADMIN','EXAM_COMMITTEE'].includes(readActiveIdentity()?.role || '')) throw Object.assign(new Error('جدولة الاختبار للإدارة ولجنة الاختبارات'), {localWriteRejected:true});
    const request = (await get('examRequests')).find(row=>row.id===route[2]);
    if (!request || request.pendingDecision || request.status!=='PENDING') throw Object.assign(new Error('الطلب غير متاح للجدولة محليًا'), {localWriteRejected:true});
    const committee = data.committeeId ? (await get('examCommittees')).find(row=>row.id===data.committeeId) : null;
    const exam = await save('exams', {...data, requestId:request.id, studentId:request.studentId, student:request.student, sectionId:request.sectionId, section:request.section, sections:request.sections||[],combinedStage:request.combinedStage, committee,scheduledAt:committee?.heldAt||data.scheduledAt,location:committee?.location||data.location,status:'SCHEDULED'}, 'schedule');
    await db.table('examRequests').update([accountId(),request.id], {pendingDecision:'schedule'});
    return exam;
  }
  if (method === 'patch' && route[0] === 'exams' && route[1] === 'requests' && ['reject','cancel'].includes(route[3])) {
    if (route[3]==='reject' && !['ADMIN','EXAM_COMMITTEE'].includes(readActiveIdentity()?.role||'')) throw Object.assign(new Error('لا تملك صلاحية رفض الطلب'), {localWriteRejected:true});
    return save('examRequests', {id:route[2],...data,pendingDecision:route[3]},route[3]);
  }
  if (['transfers', 'suspensions'].includes(route[0])) {
    const actor = readActiveIdentity();
    if (!actor || !['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(actor.role)) throw Object.assign(new Error('لا تملك صلاحية تقديم الطلب'), { localWriteRejected: true });
    const table = route[0] as 'transfers' | 'suspensions';
    if (method === 'patch' && route.length === 2) {
      const id = (await db.meta.get(`${accountId()}:id:${route[1]}`))?.value || route[1];
      const current = (await get(table)).find(row => row.id === id);
      if (!current || current.status !== 'PENDING' || current.pendingDecision || table === 'transfers' && current.kind !== 'STUDENT_TRANSFER') throw Object.assign(new Error('يمكن تعديل سبب طلب طالب معلق فقط'), { localWriteRejected: true });
      if ((current.requestedById || current.requestedBy?.id) !== actor.id && actor.role !== 'ADMIN') throw Object.assign(new Error('يمكن تعديل الطلب من قبل منشئه أو الإدارة فقط'), { localWriteRejected: true });
      if (typeof data?.reason !== 'string' || !data.reason.trim() || data.reason.length > 1000 || Object.keys(data).some(key => !['reason','previousReason'].includes(key))) throw Object.assign(new Error('اكتب سببًا صالحًا لا يتجاوز 1000 حرف'), { localWriteRejected: true });
      return save(table, { id, reason: data.reason.trim(), previousReason: data.previousReason !== undefined ? data.previousReason : current.reason ?? null }, 'update');
    }
    if (method === 'post' && (table === 'suspensions' && route.length === 1 || table === 'transfers' && route[1] === 'students')) {
      if (!data?.studentId || !String(data?.reason || '').trim()) throw Object.assign(new Error('اختر الطالب واكتب سبب الطلب'), { localWriteRejected: true });
      const student = (await get('students')).find(row => row.id === data.studentId);
      if (!student) throw Object.assign(new Error('ملف الطالب غير موجود محليًا'), { localWriteRejected: true });
      if ((await get(table)).some(row => row.studentId === student.id && row.status === 'PENDING')) throw Object.assign(new Error('يوجد طلب معلق لهذا الطالب'), { localWriteRejected: true });
      return save(table, { ...data, student, fromCircle: student.circle || null, fromCircleId: student.circleId, kind: 'STUDENT_TRANSFER', status: 'PENDING', requestedBy: { id: actor.id, fullName: actor.fullName } });
    }
    if (method === 'patch' && route.length === 3 && ['approve', 'reject', 'cancel', 'return'].includes(route[2])) {
      if (route[2] !== 'cancel' && actor.role !== 'ADMIN') throw Object.assign(new Error('قرار الطلب للإدارة فقط'), { localWriteRejected: true });
      return save(table, { ...data, id: route[1], pendingDecision: route[2] }, route[2]);
    }
  }
  if (['meetings', 'examCommittees'].includes(route[0])) {
    if (readActiveIdentity()?.role !== 'ADMIN') throw Object.assign(new Error('الإضافة والتعديل للإدارة فقط'), { localWriteRejected: true });
    const table = route[0] as EntityTable;
    if (method === 'post' && route.length === 1) return save(table, data);
    if (method === 'patch' && route.length === 2) return update(table, route[1], data);
    if (method === 'delete' && route.length === 2) return remove(table, route[1]);
  }
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
    const password = Array.from(crypto.getRandomValues(new Uint8Array(12)), value => value.toString(16).padStart(2, '0')).join('');
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
  if (table === 'students' && id === 'bulk-delete' && method === 'post' && Array.isArray(data?.ids)) { for (const rowId of data.ids) await remove('students', rowId); return { deleted: data.ids.length, synced: 0 }; }
  if (table === 'notifications' && id === 'read-all' && method === 'patch') { for (const row of await get('notifications')) if (!row.isRead) await save('notifications', { id: row.id, isRead: true }, 'read'); return { message: 'تم تعليم الإشعارات كمقروءة محليًا', synced: 0 }; }
  if (table === 'notifications' && parts[2] === 'read' && method === 'patch') return save('notifications', { id, isRead: true }, 'read');
  if (table === 'exams' && id === 'requests' && parts.length === 2 && method === 'post') { table = 'examRequests'; id = ''; }
  else if (table === 'exams' && parts[2] === 'result' && method === 'patch') action = 'result';
  else if (parts.length > 2) return undefined;
  if (!['students', 'circles', 'teachers', 'recitations', 'attendance', 'exams', 'examRequests', 'notifications', 'courses'].includes(table)) return undefined;
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  if (method === 'post' && !id) {
    if (table === 'students' && data?.createAccount) {
      const password = Array.from(crypto.getRandomValues(new Uint8Array(12)), value => value.toString(16).padStart(2, '0')).join('');
      const saved = await save(table, { ...data, accountPassword: password });
      return { ...saved, accountCredentials: { username: data.code || 'يُحدّد بعد المزامنة', temporaryPassword: password } };
    }
    return save(table, data || {});
  }
  if (method === 'patch' && id) return action ? save(table, { ...data, id }, action) : update(table, id, data || {});
  if (method === 'delete' && id && table === 'exams') {
    const exam=(await get('exams')).find(row=>row.id===id);
    if(!exam || !['SCHEDULED','CANCELLED'].includes(exam.status) || exam.score != null || exam.result != null || exam.gradedAt) throw Object.assign(new Error('يُحذف موعد غير مرصود فقط؛ صحّح نتائج الاختبارات المكتملة من سجلها'),{localWriteRejected:true});
  }
  if (method === 'delete' && id) return remove(table, id);
  return undefined;
}
