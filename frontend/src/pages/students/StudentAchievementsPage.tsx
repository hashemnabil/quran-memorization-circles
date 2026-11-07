import QuranAchievementHeart from '@/components/QuranAchievementHeart';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listOfflineSnapshot } from '@/lib/offline/changeFeed';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Card, PageHeader, LoadingState, ErrorState, Select } from '@/components/ui';
import type { PaginatedResponse, Student } from '@/types';
import { exportAchievementReport } from '@/lib/achievement-report';
import { saveDeviceFile } from '@/lib/save-device-file';
import { SURAHS } from '@/lib/quran-surahs';
import toast from 'react-hot-toast';

const parts = (value: unknown) => Math.max(0, Math.min(30, Number(value) || 0));

export default function StudentAchievementsPage() {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [circleId, setCircleId] = useState('');
  const [page, setPage] = useState(1);
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const circles = useQuery({
    queryKey: ['achievements', 'circles'],
    queryFn: async () => { try { return (await api.get<Array<{id:string;name:string}>>('/circles/options')).data; } catch (error) { if (!user || (error as {response?: unknown})?.response) throw error; const local = await listOfflineSnapshot(user.id, 'circle'); return local.filter(row => !row.deletedAt).map(row => ({id:row.id,name:String(row.name ?? '')})); } },
  });
  const students = useQuery({
    queryKey: ['achievements', 'students', search, circleId, page],
    enabled: !studentId,
    queryFn: async () => { try { return (await api.get<PaginatedResponse<Student>>('/students', { params: {page,limit:20,search:search||undefined,circleId:circleId||undefined} })).data; } catch(error) { if (!user || (error as {response?: unknown})?.response) throw error; const local = (await listOfflineSnapshot(user.id, 'student')) as unknown as Student[]; if (!local.length) throw error; const filtered = local.filter(student => (!circleId || student.circleId === circleId) && (!search || student.fullName.includes(search))); const start = (page-1)*20; return {data:filtered.slice(start,start+20),meta:{total:filtered.length,page,limit:20,totalPages:Math.max(1,Math.ceil(filtered.length/20)),hasNextPage:start+20<filtered.length,hasPreviousPage:page>1}} as PaginatedResponse<Student>; } },
  });
  const rows = students.data?.data ?? [];
  const count = students.data?.meta?.total ?? rows.length;
  const surahs = SURAHS;
  const detail = useQuery({ queryKey: ['achievements','student',studentId], queryFn: async () => { try { return (await api.get<Student>('/students/'+studentId!)).data; } catch(error) { if ((error as {response?: unknown})?.response) throw error; const cached = queryClient.getQueryData<Student>(['students',studentId!]) ?? queryClient.getQueryData<Student>(['achievements','student',studentId!]); if (cached?.id === studentId!) return cached; throw error; } }, enabled: !!studentId });
  const completed = new Set((detail.data?.surahCompletions ?? []).map(item => item.surah));
  const completedCount = surahs.filter(item => completed.has(item.name)).length ?? 0;
  const exportReport = async () => {
    const student = detail.data;
    if (!student) return;
    try { await saveDeviceFile(await exportAchievementReport(student), 'تقرير-إنجاز-' + student.fullName + '.pdf'); } catch { toast.error('تعذّر حفظ تقرير الإنجاز على الجهاز'); }
  };
  return <div dir="rtl" className="space-y-5">
    {!studentId && <PageHeader title="إنجازات الطلاب" subtitle={user?.role === 'TEACHER' ? 'متابعة إنجازات طلاب حلقاتك' : 'متابعة إنجازات طلاب المدرسة حسب الحلقة والطالب'} />}
    {!studentId && <Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">ابحث عن طالب
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-3" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="اسم الطالب" />
        </label>
        <label className="text-sm font-bold text-slate-700">الحلقة
          <Select value={circleId} onChange={event => { setCircleId(event.target.value); setPage(1); }}>
            <option value="">كل الحلقات المتاحة</option>
            {(circles.data ?? []).map(circle => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
          </Select>
        </label>
      </div>
      {!navigator.onLine && <p role="status" className="mt-3 text-sm font-semibold text-amber-700">وضع دون إنترنت: البيانات المحفوظة على الجهاز فقط. افتح تفاصيل الطالب مرة أثناء الاتصال لحفظ السور.</p>}
      <p className="mt-4 text-sm text-slate-500">الطلاب في نتائج البحث: {count}. التقدم المعروض يعتمد على الأجزاء المحفوظة المسجلة، ولا يحتسب سورًا مكتملة دون سجل يؤكد ذلك.</p>
    </Card>}
    {!studentId && (students.isLoading ? <LoadingState /> : students.isError ? <ErrorState message={apiError(students.error, 'تعذّر تحميل إنجازات الطلاب')} onRetry={() => void students.refetch()} /> :
      <Card><div className="space-y-2">
        {rows.length === 0 && <p className="p-6 text-center text-slate-500">لا يوجد طلاب مطابقون للبحث.</p>}
        {rows.map(student => <button type="button" key={student.id} onClick={() => navigate(`/students/achievements/${student.id}`)}
          className="w-full rounded-2xl border border-slate-200 p-4 text-right transition hover:border-emerald-600">
          <div className="flex items-center justify-between gap-3"><strong>{student.fullName}</strong><span className="text-sm font-bold text-emerald-800">{parts(student.memorizedParts)} / 30 جزءًا</span></div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${parts(student.memorizedParts) / 30 * 100}%` }} /></div>
          <span className="mt-2 block text-xs text-slate-500">{student.circle?.name ?? 'بدون حلقة'} · {Math.round(parts(student.memorizedParts) / 30 * 100)}٪ من الأجزاء</span>
        </button>)}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3"><button className="rounded-xl border px-4 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => setPage(value => value - 1)}>السابق</button><span>صفحة {page}</span><button className="rounded-xl border px-4 py-2 disabled:opacity-40" disabled={!students.data?.meta?.hasNextPage} onClick={() => setPage(value => value + 1)}>التالي</button></div>
      </Card>)}
    {studentId && <Card>
      <button type="button" onClick={() => navigate("/students/achievements")} className="mb-5 rounded-xl border border-emerald-300 px-4 py-2 font-bold text-emerald-800">← العودة إلى قائمة الطلاب</button>
      {detail.isLoading ? <LoadingState /> : detail.isError ? <ErrorState message="تعذّر تحميل إنجازات الطالب" onRetry={() => void detail.refetch()} /> : detail.data && <>
      <div className="rounded-3xl bg-gradient-to-l from-emerald-900 to-teal-700 p-6 text-white"><p>لوحة الإنجازات القرآنية</p><h1 className="mt-2 text-3xl font-extrabold">{detail.data.fullName}</h1><p className="mt-2">{detail.data.circle?.name ?? "بدون حلقة"}</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-emerald-50 p-5">الأجزاء المحفوظة<strong className="block text-3xl text-emerald-800">{parts(detail.data.memorizedParts)} / 30</strong></div><div className="rounded-2xl bg-rose-50 p-5">السور المكتملة<strong className="block text-3xl text-rose-700">{completedCount} / 114</strong></div><div className="rounded-2xl bg-amber-50 p-5">نسبة حفظ الأجزاء<strong className="block text-3xl text-amber-800">{Math.round(parts(detail.data.memorizedParts) / 30 * 100)}٪</strong></div></div>
      <p className="mt-2 text-slate-600">الأجزاء المحفوظة: <strong>{parts(detail.data.memorizedParts)} من 30</strong></p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${parts(detail.data.memorizedParts) / 30 * 100}%` }} /></div>
      <div className="mt-6">
        <h3 className="text-center text-xl font-extrabold text-rose-700">قلبي القرآني</h3>
        <p className="mt-1 text-center text-sm text-slate-600">{completedCount} / 114 سورة مكتملة</p>
        <QuranAchievementHeart completed={completed} />
        <p className="mt-3 text-center text-xs text-slate-500">الأحمر للسور المثبت إتمامها في سجل الطالب، والأبيض للسور الأخرى.</p>
      </div>
      <button type="button" onClick={() => void exportReport()} disabled={!detail.data} className="mt-4 rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white disabled:opacity-50">تصدير تقرير الإنجاز PDF</button>
      <Link className="mt-4 inline-flex rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white" to={`/students/${studentId}`}>فتح ملف الطالب</Link>
      </>}
    </Card>}
  </div>;
}
