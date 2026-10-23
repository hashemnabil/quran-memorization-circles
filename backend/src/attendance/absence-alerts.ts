import { Notification, Prisma } from '@prisma/client';
import { recordNotificationChange } from '../notifications/notifications.service';

export function absencePeriods(date: Date) {
  const week = new Date(date);
  week.setUTCDate(week.getUTCDate() - (week.getUTCDay() + 1) % 7);
  week.setUTCHours(0, 0, 0, 0);
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return { week, month, weekEnd: new Date(week.getTime() + 7 * 86400000),
    monthEnd: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)) };
}

/** Called in the attendance transaction. Notification keys survive outbox retries. */
export async function createAbsenceAlerts(tx: Prisma.TransactionClient, studentId: string, date: Date) {
  const notices: Notification[] = [];
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('absence-policy'), hashtext(${studentId}))) AS locked`;
  const student = await tx.student.findUnique({ where: { id: studentId }, select: {
    id: true, fullName: true, userId: true, parentProfile: { select: { userId: true } },
  } });
  if (!student) return notices;
  const { week, month, weekEnd, monthEnd } = absencePeriods(date);
  const [weekly, monthly] = await Promise.all([
    tx.attendance.count({ where: { studentId, status: 'ABSENT', date: { gte: week, lt: weekEnd } } }),
    tx.attendance.count({ where: { studentId, status: 'ABSENT', date: { gte: month, lt: monthEnd } } }),
  ]);
  const day = date.toISOString().slice(0, 10);
  const alerts = [{ key: `day:${day}`, admin: false, title: 'تنبيه غياب',
    body: `تم تسجيل غياب ${student.fullName} بتاريخ ${day}. يرجى الالتزام بالحضور؛ تكرار الغياب قد يؤدي إلى الفصل بقرار الإدارة.` }];
  for (const period of [
    { count: weekly, warning: 2, review: 3, key: `week:${week.toISOString().slice(0, 10)}`, label: 'الأسبوع' },
    { count: monthly, warning: 4, review: 5, key: `month:${month.toISOString().slice(0, 10)}`, label: 'الشهر' },
  ]) {
    if (period.count >= period.warning) alerts.push({ key: `${period.key}:warning`, admin: false,
      title: 'تحذير من الفصل بسبب الغياب', body: `بلغ غياب ${student.fullName} ${period.count} أيام خلال ${period.label}. استمرار الغياب يعرض الطالب للفصل بقرار الإدارة.` });
    if (period.count >= period.review) alerts.push({ key: `${period.key}:review`, admin: true,
      title: 'مطلوب قرار الإدارة بشأن الغياب', body: `بلغ غياب ${student.fullName} ${period.count} أيام خلال ${period.label}. يرجى مراجعة سجل الحضور واتخاذ قرار الاستمرار أو الفصل. لم يتم فصل الطالب تلقائيًا.` });
  }
  const admins = alerts.some(a => a.admin) ? await tx.user.findMany({ where: { role: 'ADMIN', isActive: true, deletedAt: null }, select: { id: true } }) : [];
  for (const alert of alerts) {
    const recipients = alert.admin ? admins.map(u => u.id) : [student.userId, student.parentProfile?.userId].filter((id): id is string => !!id);
    for (const userId of new Set(recipients)) {
      const alertKey = `absence:${studentId}:${alert.key}`;
      if (await tx.notification.findFirst({ where: { userId, data: { path: ['alertKey'], equals: alertKey } } })) continue;
      const row = await tx.notification.create({ data: { userId, type: 'ATTENDANCE', title: alert.title, body: alert.body,
        link: alert.admin ? `/students/${studentId}` : userId === student.userId ? '/student' : `/parent/children/${studentId}`,
        data: { alertKey, studentId, date: day, weekly, monthly, requiresDecision: alert.admin } } });
      await recordNotificationChange(tx, row);
      notices.push(row);
    }
  }
  return notices;
}
