import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, LoadingState, PageHeader } from '@/components/ui';
import DonationPanel from '@/components/DonationPanel';
import { IconHeart } from '@/components/ui/Icons';
import type { SchoolSettings } from '@/types';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';

function amount(value?: number | null, currency?: string | null) {
  if (typeof value !== 'number') return '—';
  const formatted = new Intl.NumberFormat('ar').format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

export default function DonationsPage() {
  const admin = useAuthStore(state => state.user?.role === 'ADMIN');
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'donations'],
    queryFn: async () => (await api.get<SchoolSettings>('/settings/donations')).data,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading && !data) return <LoadingState rows={3} />;
  const enabled = true;
  const goal = Number(data?.donationGoalAmount || 0);
  const raised = Number(data?.donationRaisedAmount || 0);
  const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="التبرعات" subtitle="طرق المساهمة الرسمية وملاحظات المتبرعين" />
      {admin && <Link to="/settings" className="inline-flex rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white">تعديل أرقام التحويل من إعدادات المدرسة</Link>}
      <Card className="overflow-hidden">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-6 text-white sm:p-9">
          <div className="absolute -left-10 -top-12 h-48 w-48 rounded-full border border-white/10" />
          <div className="relative">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-emerald-100"><IconHeart size={25} /></span>
            <p className="mt-5 text-sm font-semibold text-emerald-100">مساهمة في تعليم القرآن الكريم</p>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{enabled ? data?.donationTitle || 'ساهم في دعم الحلقات' : 'حملة التبرعات غير منشورة حاليًا'}</h1>
            <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-7 text-emerald-50/90">
              {enabled ? data?.donationDescription || 'ساهم في دعم طلاب القرآن الكريم وأنشطة الحلقات.' : 'عند نشر حملة جديدة ستظهر تفاصيلها وطرق المساهمة هنا.'}
            </p>
          </div>
        </div>
        {enabled && <div className="grid gap-5 p-5 sm:p-7">
          {(goal > 0 || data?.donationRaisedAmount != null) && <section aria-label="تقدم الحملة" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-semibold text-slate-500">المبلغ المجموع</p><p className="mt-1 text-2xl font-extrabold text-emerald-900">{amount(raised, data?.donationCurrency)}</p></div>
              {goal > 0 && <div className="text-left"><p className="text-xs font-semibold text-slate-500">الهدف</p><p className="mt-1 text-lg font-bold text-slate-700">{amount(goal, data?.donationCurrency)}</p></div>}
            </div>
            {goal > 0 && <><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs font-semibold text-slate-500">اكتمل {progress}% من الهدف</p></>}
          </section>}
          <DonationPanel settings={data} />
          <p className="text-xs leading-6 text-slate-500">يُحدّث إجمالي المساهمات يدويًا من الإدارة. الصفحة لا تحفظ بيانات الدفع ولا تنفّذ التحويلات.</p>
        </div>}
      </Card>
    </div>
  );
}
