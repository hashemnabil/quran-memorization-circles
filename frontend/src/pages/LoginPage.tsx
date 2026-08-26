import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { IconAlert, IconLifeBuoy, IconLock, IconMosque, IconUser } from '@/components/ui/Icons';
import { phoneError, PHONE_HINT, USERNAME_HINT } from '@/lib/validation';
import type { AuthUser, SchoolSettings } from '@/types';

/**
 * Single centred card rather than the old half-and-half split: on a wide screen
 * the two panels left a hard seam down the middle of the page.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [supportOpen, setSupportOpen] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => (await api.get<SchoolSettings>('/settings/public')).data,
    staleTime: 10 * 60 * 1000,
  });

  const onAuthenticated = (user: AuthUser) => {
    toast.success(`أهلاً بك، ${user.fullName}`);
    navigate('/', { replace: true });
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
            /* The logo stands on the background on its own — no plate behind
               it. A logo is rarely square either, so the height is fixed and
               the width follows the artwork. */
            <img
              src={settings.logoUrl}
              alt={settings.name ?? 'شعار المدرسة'}
              className="mx-auto mb-5 h-28 w-auto max-w-[17rem] object-contain"
            />
          ) : (
            <span className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-2xl bg-white/10 text-gold-300 ring-1 ring-white/15">
              <IconMosque size={44} />
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
            'إدارة الحلقات والدورات التعليمية',
            'اختبارات متسلسلة للأجزاء والأحزاب',
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

        {/* Someone who cannot sign in is exactly the person who needs support,
            so the way to reach it must not be behind the login. */}
        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-xs font-semibold text-primary-100 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
        >
          <IconLifeBuoy size={16} />
          تواجه مشكلة في الدخول؟ تواصل مع الدعم الفني
        </button>

        <footer className="mt-4 text-center text-xs text-primary-200/70">
          {settings?.phone && (
            <p>
              للاستفسار: <span className="numeric">{settings.phone}</span>
            </p>
          )}
        </footer>
      </div>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}

// --- the form ---------------------------------------------------------------

function CredentialsStep({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      onAuthenticated(await login(username.trim().toLowerCase(), password));
    } catch (err) {
      setError(apiError(err, 'تعذر تسجيل الدخول'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-lg font-extrabold text-slate-800">تسجيل الدخول</h2>
      <p className="mt-1 text-sm text-slate-500">أدخل اسم المستخدم وكلمة المرور للمتابعة</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="relative">
          <Input
            label="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ahmed2026"
            autoComplete="username"
            autoFocus
            dir="ltr"
            className="[&_input]:pr-10"
            hint={USERNAME_HINT}
          />
          <IconUser size={17} className="pointer-events-none absolute right-3 top-[38px] text-slate-400" />
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
    </>
  );
}

// --- unauthenticated support request ----------------------------------------

function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const empty = { contactName: '', contactPhone: '', contactEmail: '', subject: '', description: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);

  const set = (key: keyof typeof empty, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clearing as they type: an error that outlives the mistake is noise.
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const close = () => {
    setForm(empty);
    setErrors({});
    setTicketNumber(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.contactName.trim()) next.contactName = 'الاسم مطلوب';
    if (!form.subject.trim()) next.subject = 'الموضوع مطلوب';
    if (!form.description.trim()) next.description = 'وصف المشكلة مطلوب';
    const phoneErr = phoneError(form.contactPhone);
    if (phoneErr) next.contactPhone = phoneErr;
    if (!form.contactPhone.trim() && !form.contactEmail.trim()) {
      next.contactPhone = 'أدخل جوالاً أو بريداً إلكترونياً للتواصل معك';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const { data } = await api.post('/support/public', {
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        subject: form.subject.trim(),
        description: form.description.trim(),
      });
      setTicketNumber(data.number);
    } catch (err) {
      setErrors({ form: apiError(err, 'تعذر إرسال الطلب') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="التواصل مع الدعم الفني" size="md">
      {ticketNumber ? (
        <div className="py-4 text-center">
          <p className="text-base font-bold text-slate-800">تم استلام طلبك</p>
          <p className="mt-2 text-sm text-slate-600">
            رقم الطلب: <span className="numeric font-bold text-primary-700">#{ticketNumber}</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">سيتم التواصل معك في أقرب وقت بإذن الله.</p>
          <Button className="mt-5" onClick={close}>
            إغلاق
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {errors.form && <Alert>{errors.form}</Alert>}
          <p className="text-sm text-slate-500">
            إذا تعذّر عليك تسجيل الدخول، أرسل لنا المشكلة وسنتواصل معك.
          </p>

          <Input
            label="الاسم"
            value={form.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            error={errors.contactName}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="رقم الجوال"
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
              error={errors.contactPhone}
              hint={PHONE_HINT}
              dir="ltr"
            />
            <Input
              label="البريد الإلكتروني"
              type="email"
              value={form.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
              error={errors.contactEmail}
              dir="ltr"
            />
          </div>
          <Input
            label="الموضوع"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
            error={errors.subject}
            placeholder="مثال: نسيت كلمة المرور"
            required
          />
          <Textarea
            label="وصف المشكلة"
            rows={4}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            error={errors.description}
            required
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={close}>
              إلغاء
            </Button>
            <Button type="submit" loading={loading}>
              إرسال الطلب
            </Button>
          </div>
        </form>
      )}
    </Modal>
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
