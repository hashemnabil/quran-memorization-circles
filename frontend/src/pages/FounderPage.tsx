import { useQuery } from '@tanstack/react-query';
import { Card, PageHeader, LoadingState, ErrorState, Tabs } from '@/components/ui';
import { useState } from 'react';
import { api } from '@/lib/api';
import FounderAssetLibrary from '@/components/FounderAssetLibrary';
import FounderPopups from '@/components/FounderPopups';
import { Link } from 'react-router-dom';

export default function FounderPage() {
  const [tab, setTab] = useState('overview');
  const overview = useQuery({ queryKey: ['founder', 'overview'], queryFn: async () => (await api.get('/founder/overview')).data });
  const audit = useQuery({ queryKey: ['founder', 'audit'], queryFn: async () => (await api.get('/founder/audit')).data });
  const school = useQuery({ queryKey: ['founder', 'school'], queryFn: async () => (await api.get('/founder/school')).data, enabled: tab === 'school' });
  const system = useQuery({ queryKey: ['founder', 'system'], queryFn: async () => (await api.get('/founder/system')).data, enabled: tab === 'system' });
  const labels: Record<string, string> = { users: 'المستخدمون', students: 'الطلاب', teachers: 'المحفظون', supervisors: 'المشرفون', circles: 'الحلقات', courses: 'الدورات' };
  return <>
    <PageHeader title="لوحة المؤسس" subtitle="متابعة المدرسة وسجل العمليات" />
    <Link className="btn-secondary mb-4 inline-flex" to="/founder/users">إدارة المستخدمين</Link>
    <Link className="btn-secondary mb-4 ms-2 inline-flex" to="/founder/settings">إعدادات المدرسة والهوية البصرية</Link>
    <Link className="btn-secondary mb-4 ms-2 inline-flex" to="/founder/school-announcements">إعلانات المدرسة</Link>
    <Tabs active={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'نظرة عامة' }, { key: 'school', label: 'متابعة المدرسة' }, { key: 'system', label: 'حالة النظام' }, { key: 'assets', label: 'مكتبة الموارد' }, { key: 'popups', label: 'الإعلانات العامة' }, { key: 'audit', label: 'سجل العمليات' }]} />
    {tab === 'school' && (school.isPending ? <LoadingState /> : school.isError ? <ErrorState message="تعذر تحميل بيانات المدرسة" onRetry={() => school.refetch()} /> : <div className="space-y-4"><Card title="ملخص المدرسة"><p>الاختبارات: {school.data.exams} · الشهادات: {school.data.certificates}</p><p className="mt-2 text-sm">{(school.data.attendance || []).map((item: any) => `${({PRESENT:'حضور',ABSENT:'غياب',EXCUSED:'بعذر'} as Record<string,string>)[item.status] || item.status}: ${item._count}`).join(' · ')}</p></Card>{['circles','courses'].map(key => <Card key={key} title={key === 'circles' ? 'الحلقات — حتى 200 سجل' : 'الدورات — حتى 200 سجل'}><ul className="divide-y">{(school.data[key] || []).map((item: any) => <li className="py-3" key={item.id}>{item.name} <span className="text-xs text-slate-500">{item.code}</span></li>)}</ul></Card>)}</div>)}
    {tab === 'system' && (system.isPending ? <LoadingState /> : system.isError ? <ErrorState message="تعذر التحقق من النظام" onRetry={() => system.refetch()} /> : <Card title="مؤشرات التشغيل"><dl className="space-y-4"><div><dt className="font-bold">قاعدة البيانات</dt><dd>نجح الاتصال عند {new Date(system.data.checkedAt).toLocaleString('ar')}</dd></div><div><dt className="font-bold">سجل المزامنة</dt><dd>{system.data.latestChange ? `آخر إصدار ${system.data.latestChange.revision} — ${new Date(system.data.latestChange.changedAt).toLocaleString('ar')}` : 'لا توجد تغييرات مسجلة'}</dd></div><div><dt className="font-bold">حالة مزامنة الأجهزة</dt><dd>غير متاحة مركزياً؛ سجل الخادم لا يثبت اكتمال المزامنة لدى كل جهاز.</dd></div><div><dt className="font-bold">النسخ الاحتياطية</dt><dd>سجل النسخ الاحتياطية غير مربوط بهذه اللوحة؛ لا توجد نتيجة تحقق يمكن عرضها.</dd></div></dl></Card>)}
    {tab === 'assets' && <FounderAssetLibrary />}
    {tab === 'popups' && <FounderPopups />}
    {tab === 'overview' && (overview.isPending ? <LoadingState /> : overview.isError ? <ErrorState message="تعذر تحميل الإحصاءات" onRetry={() => overview.refetch()} /> : <><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Object.entries(labels).map(([key, label]) => <Card key={key}><p className="text-sm text-slate-500">{label}</p><strong className="text-3xl text-primary-700">{overview.data[key]}</strong></Card>)}</div><p className="mt-4 text-xs text-slate-500">آخر جلب: {overview.data.checkedAt ? new Date(overview.data.checkedAt).toLocaleString('ar') : 'غير متاح'}. هذه الإحصاءات لا تؤكد صحة النسخ الاحتياطية أو جميع خدمات النظام.</p></>)}
    {tab === 'audit' && <div className="mt-5"><Card title="سجل العمليات — للقراءة فقط">
      {audit.isPending ? <LoadingState /> : audit.isError ? <ErrorState message="تعذر تحميل سجل العمليات" onRetry={() => audit.refetch()} /> : <ul className="divide-y divide-slate-100">{audit.data.map((entry: { id: string; summary: string; createdAt: string }) => <li key={entry.id} className="py-3"><p>{entry.summary}</p><time className="text-xs text-slate-500" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('ar')}</time></li>)}</ul>}
    </Card></div>}
  </>;
}
