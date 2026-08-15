import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { IconAlert, IconLock, IconMail, IconMosque } from '@/components/ui/Icons';
import type { AuthUser, SchoolSettings } from '@/types';

const DEMO_ACCOUNTS = [
  { role: 'مدير عام', email: 'admin@alnoor-quran.sa' },
  { role: 'مشرف', email: 'supervisor1@alnoor-quran.sa' },
  { role: 'معلم', email: 'teacher1@alnoor-quran.sa' },
  { role: 'لجنة الاختبارات', email: 'committee1@alnoor-quran.sa' },
  { role: 'ولي أمر', email: 'parent1@alnoor-quran.sa' },
  { role: 'دعم فني', email: 'support@alnoor-quran.sa' },
];

/**
 * Single centred card rather than the old half-and-half split: on a wide screen
 * the two panels left a hard seam down the middle of the page.
 */
export default function LoginPage() {
  const navigate = useNavigate();

  const { data: settings } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => (await api.get<SchoolSettings>('/settings/public')).data,
    staleTime: 10 * 60 * 1000,
  });

  // A password the management chose has to be replaced before anything else,
  // so that first login lands on the profile page instead of the dashboard.
  const onAuthenticated = (user: AuthUser) => {
    toast.success(`أهلاً بك، ${user.fullName}`);
    navigate(user.mustChangePassword ? '/profile' : '/', { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-primary-900 px-4 py-10">
      {/* Decorative background: a soft glow plus a faint geometric tile. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0 45 15 30 30 15 15z M30 30 45 45 30 60 15 45z' fill='none' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[46rem] -translate-x-1/2 rounded-full bg-gold-400/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md flex-col justify-center">
        <header className="mb-6 text-center">
          {settings?.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt=""
              className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-white/10 object-contain p-2.5"
            />
          ) : (
            <span className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-2xl bg-white/10 text-gold-300 ring-1 ring-white/15">
              <IconMosque size={40} />
            </span>
          )}
          <h1 className="text-2xl font-extrabold text-white">
            {settings?.name ?? 'حلقات تحفيظ القرآن الكريم'}
          </h1>
          {settings?.mosqueName && (
            <p className="mt-1 text-sm text-primary-200">{settings.mosqueName}</p>
          )}
          <p className="mt-4 text-lg font-extrabold leading-loose text-gold-200">
            ﴿ وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِنْ مُدَّكِرٍ ﴾
          </p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-primary-100/85">
            {settings?.about ??
              'نظام متكامل لإدارة حلقات تحفيظ القرآن الكريم: متابعة الطلاب والحضور والتسميع والاختبارات، وتواصل مباشر بين المعلمين والمشرفين وأولياء الأمور.'}
          </p>
        </header>

        <div className="card p-6 sm:p-7">
          <CredentialsStep onAuthenticated={onAuthenticated} />
        </div>

        {/* What the system covers — the same four points the old side panel carried,
            folded into the centred column so nothing is cut off. */}
        <ul className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
          {[
            'متابعة الحضور والتسميع اليومي',
            'إدارة الحلقات والمعلمين',
            'اختبارات متسلسلة للأجزاء',
            'بوابة خاصة لأولياء الأمور',
          ].map((item) => (
            <li
              key={item}
              className="flex items-center gap-1.5 rounded-xl bg-white/5 px-2.5 py-2 text-primary-100/90 ring-1 ring-white/10"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
              {item}
            </li>
          ))}
        </ul>

        <footer className="mt-4 text-center text-xs text-primary-200/70">
          {settings?.phone && (
            <p>
              للاستفسار: <span className="numeric">{settings.phone}</span>
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

// --- the form ---------------------------------------------------------------

function CredentialsStep({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      onAuthenticated(await login(email.trim(), password));
    } catch (err) {
      setError(apiError(err, 'تعذر تسجيل الدخول'));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (value: string) => {
    setEmail(value);
    setPassword('Pass@1234');
    setError('');
  };

  return (
    <>
      <h2 className="text-lg font-extrabold text-slate-800">تسجيل الدخول</h2>
      <p className="mt-1 text-sm text-slate-500">أدخل بريدك الإلكتروني وكلمة المرور للمتابعة</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="relative">
          <Input
            label="البريد الإلكتروني"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            autoFocus
            dir="ltr"
            className="[&_input]:pr-10"
          />
          <IconMail size={17} className="pointer-events-none absolute right-3 top-[38px] text-slate-400" />
        </div>

        <div className="relative">
          <Input
            label="كلمة المرور"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            dir="ltr"
            // Extra left padding keeps the text clear of the show/hide toggle.
            className="[&_input]:pr-10 [&_input]:pl-16"
          />
          <IconLock size={17} className="pointer-events-none absolute right-3 top-[38px] text-slate-400" />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute left-3 top-[36px] text-xs font-semibold text-slate-400 transition hover:text-slate-600"
          >
            {showPassword ? 'إخفاء' : 'إظهار'}
          </button>
        </div>

        <Button type="submit" loading={loading} className="w-full">
          دخول
        </Button>
      </form>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => setShowDemo((v) => !v)}
          className="mx-auto block text-xs font-semibold text-slate-400 transition hover:text-slate-600"
        >
          {showDemo ? 'إخفاء الحسابات التجريبية' : 'عرض الحسابات التجريبية'}
        </button>

        {showDemo && (
          <div className="mt-3">
            <p className="mb-2.5 text-center text-xs text-slate-400">
              كلمة المرور للجميع: <span className="numeric font-semibold">Pass@1234</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc.email)}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-center transition hover:border-primary-300 hover:bg-primary-50"
                >
                  <span className="block text-[11px] font-bold text-slate-700">{acc.role}</span>
                  <span className="numeric block truncate text-[10px] text-slate-400">
                    {acc.email.split('@')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
      <IconAlert size={18} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
