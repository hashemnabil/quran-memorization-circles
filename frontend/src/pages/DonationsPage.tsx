import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { ErrorState, LoadingState } from '@/components/ui';
import DonationPanel from '@/components/DonationPanel';
import { IconHeart, IconBook, IconUsers, IconChevronRight, IconSettings } from '@/components/ui/Icons';
import type { SchoolSettings } from '@/types';
import { useAuthStore } from '@/store/auth';

function amount(value: number, currency?: string | null) {
  const formatted = new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

export default function DonationsPage() {
  const user = useAuthStore(state => state.user);
  const admin = user?.role === 'ADMIN';
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings', 'donations'],
    queryFn: async () => (await api.get<SchoolSettings>('/settings/public')).data,
    staleTime: 10 * 60 * 1000,
  });
  if (isLoading && !data) return <LoadingState rows={3} />;
  if (isError && !data) return <ErrorState message="تعذر تحميل تفاصيل التبرعات" onRetry={() => refetch()} />;
  const goal = Math.max(0, Number(data?.donationGoalAmount) || 0);
  const raised = Math.max(0, Number(data?.donationRaisedAmount) || 0);
  const progress = goal > 0 ? Math.min(100, Math.round(raised / goal * 100)) : 0;

  return (
    <div className="donations-page mx-auto max-w-6xl space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={user ? '/' : '/login'} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 hover:text-emerald-800"><IconChevronRight size={17} />{user ? 'العودة للرئيسية' : 'العودة لتسجيل الدخول'}</Link>
        {admin && <Link to="/settings" className="btn-secondary btn-sm"><IconSettings size={16} />إدارة حملة التبرعات</Link>}
      </div>
      <section className="donation-hero">
        <div className="donation-hero-pattern" aria-hidden="true" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-emerald-100"><IconHeart size={15} />معًا لخدمة كتاب الله</span>
            <h1 className="mt-5 max-w-xl text-3xl font-extrabold leading-relaxed sm:text-4xl">{data?.donationTitle === 'دعم مدرسة التحفيظ' ? 'دعم أهل القرآن' : (data?.donationTitle || 'دعم أهل القرآن')}</h1>
            <p className="mt-4 max-w-xl whitespace-pre-line text-sm leading-8 text-emerald-50/90">{data?.donationDescription || 'ساهم في دعم طلاب القرآن الكريم وأنشطة الحلقات، وكن شريكًا في رحلة الحفظ والتعلّم.'}</p>
            <a href="#donation-methods" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gold-200 px-6 py-3 text-sm font-extrabold text-emerald-950 transition hover:bg-gold-100"><IconHeart size={18} />ساهم الآن</a>
            <p className="mt-4 text-xs text-emerald-100">{data?.name || 'حلقات تحفيظ القرآن الكريم'}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm sm:p-7">
            <span className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-gold-200"><IconBook size={25} /></span>
            <p className="text-sm font-bold text-emerald-100">{goal > 0 || data?.donationRaisedAmount != null ? 'إجمالي المساهمات' : 'كل مساهمة تصنع أثرًا'}</p>
            {goal > 0 || data?.donationRaisedAmount != null ? <>
              <p className="mt-2 break-words text-3xl font-extrabold leading-relaxed">{amount(raised, data?.donationCurrency)}</p>
              {goal > 0 && <>
                <div role="progressbar" aria-label="تقدم حملة التبرعات" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-5 h-2.5 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-gold-200" style={{ width: `${progress}%` }} /></div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-emerald-100"><span>تحقق {progress}% من الهدف</span><span>الهدف: {amount(goal, data?.donationCurrency)}</span></div>
              </>}
              <p className="mt-4 text-xs leading-6 text-emerald-100/80">يُحدّث إجمالي المساهمات من إدارة المدرسة.</p>
            </> : <p className="mt-3 text-sm leading-8 text-emerald-50">اختر وسيلة التحويل المناسبة لك من الحسابات الموضّحة أدناه، وتواصل مع الإدارة لأي استفسار.</p>}
          </div>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div id="donation-methods" className="min-w-0 scroll-mt-28"><DonationPanel settings={data} /></div>
        <aside className="space-y-5">
          <section className="card p-5 sm:p-6">
            <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><IconUsers size={22} /></span>
            <h2 className="text-lg font-extrabold text-slate-800">كيف أساهم؟</h2>
            <ol className="mt-5 space-y-5">
              {['اختر وسيلة التحويل المناسبة لك.', 'انسخ الرقم وتحقق من بيانات المستفيد مع الإدارة.', 'أكمل التحويل من تطبيق البنك أو المحفظة.'].map((step, index) => <li key={step} className="flex gap-3 text-sm leading-7 text-slate-600"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-extrabold text-emerald-800">{index + 1}</span><span>{step}</span></li>)}
            </ol>
          </section>
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5"><h2 className="font-bold text-emerald-950">لديك استفسار؟</h2><p className="mt-2 text-sm leading-7 text-slate-600">أرسل رسالتك من النموذج، وأضف رقم جوالك إذا رغبت أن تتواصل معك الإدارة.</p></section>
        </aside>
      </div>
    </div>
  );
}
