import axios from 'axios';
import React, { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { IconAlert, IconLifeBuoy, IconLock, IconMosque, IconUser } from '@/components/ui/Icons';
import { phoneError, PHONE_HINT, USERNAME_HINT } from '@/lib/validation';
import type { AuthUser, SchoolSettings } from '@/types';
import LocalAvailabilityBadge from '@/components/LocalAvailabilityBadge';
import { savePendingSupport } from '@/lib/offline/pendingSupport';

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
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md flex-col justify-center">
        <header className="mb-6 text-center">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt={settings.name ?? 'شعار المدرسة'} className="mx-auto mb-5 h-28 w-auto max-w-[17rem] object-contain" />
          ) : (
            <span className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-2xl bg-white/10 text-gold-300 ring-1 ring-white/15">
              <IconMosque size={44} />
            </span>
          )}
          <h1 className="text-2xl font-extrabold text-white">{settings?.name ?? 'حلقات تحفيظ القرآن الكريم'}</h1>
          {settings?.mosqueName && <p className="mt-1 text-sm text-primary-200">{settings.mosqueName}</p>}
          <p className="mt-4 text-lg font-extrabold leading-loose text-gold-200">﴿ وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِنْ مُدَّكِرٍ ﴾</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-primary-100/85">{settings?.about ?? 'نظام متكامل لإدارة حلقات تحفيظ القرآن الكريم: متابعة الطلاب والحضور والتسميع والاختبارات، وتواصل الفريق.'}</p>

          {/* Local availability badge: shows if a local snapshot exists so the site can open offline */}
          <LocalAvailabilityBadge />
        </header>

        <div className="card p-6 sm:p-7">
          <CredentialsStep onAuthenticated={onAuthenticated} />
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
          {[
            'متابعة الحضور والتسميع اليومي',
            'إدارة الحلقات والدورات التعليمية',
            'اختبارات متسلسلة للأجزاء والأحزاب',
            'ملفات وشهادات الطالب',
          ].map((item) => (
            <li key={item} className="flex items-center gap-1.5 rounded-xl bg-white/5 px-2.5 py-2 text-primary-100/90 ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
              {item}
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => setSupportOpen(true)} className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-xs font-semibold text-primary-100 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white">
          <IconLifeBuoy size={16} />
          تواجه مشكلة في الدخول؟ تواصل مع الدعم الفني
        </button>

        <footer className="mt-4 text-center text-xs text-primary-200/70">
          {settings?.phone && (
            <p>للاستفسار: <span className="numeric">{settings.phone}</span></p>
          )}
        </footer>
      </div>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}

function CredentialsStep({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const login = useAuthStore((s) => s.login);

  const [rememberUsername, setRememberUsername] = useState(() => {
    try { return localStorage.getItem('qc.rememberUsername') !== '0'; } catch { return true; }
  });
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem('qc.savedUsername') || ''; } catch { return ''; }
  });
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
      const normalizedUsername = username.trim().toLowerCase();
      const user = await login(normalizedUsername, password);
      try {
        if (rememberUsername) localStorage.setItem('qc.savedUsername', normalizedUsername);
        else localStorage.removeItem('qc.savedUsername');
        localStorage.setItem('qc.rememberUsername', rememberUsername ? '1' : '0');
      } catch { /* optional */ }
      onAuthenticated(user);
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
          <Input label="اسم المستخدم (رقم الطالب للطلاب)" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="رقم الطالب أو اسم المستخدم" autoComplete="username" autoFocus dir="ltr" className="[_&amp;_input]:pr-10" hint={USERNAME_HINT} />
        </div>

        <div className="relative">
          <Input label="كلمة المرور" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" dir="ltr" className="[_&amp;_input]:pr-10 [_&amp;_input]:pl-16" />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={rememberUsername} onChange={(e) => setRememberUsername(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
          تذكّر اسم المستخدم على هذا الجهاز
        </label>

        <Button type="submit" loading={loading} className="w-full">دخول</Button>
      </form>
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

function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const empty = { contactName: '', contactPhone: '', contactEmail: '', subject: '', description: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);

  const set = (key: keyof typeof empty, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const close = () => { setForm(empty); setErrors({}); setTicketNumber(null); onClose(); };

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
      // If offline, save locally and inform the user.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const saved = await savePendingSupport({
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          subject: form.subject.trim(),
          description: form.description.trim(),
        });
        toast.success('تم حفظ طلب الدعم على هذا الجهاز وسيُرسل عند عودة الاتصال');
        setTicketNumber(null);
        setLoading(false);
        return;
      }

      const { data } = await api.post('/support/public', {
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        subject: form.subject.trim(),
        description: form.description.trim(),
      });
      setTicketNumber(data.number);
    } catch (err) {
      // Network failure: save locally as fallback.
      const isNetworkFailure = !navigator.onLine || (axios.isAxiosError(err) && !err.response);
      if (isNetworkFailure) {
        try {
          const saved = await savePendingSupport({
            contactName: form.contactName.trim(),
            contactPhone: form.contactPhone.trim() || undefined,
            contactEmail: form.contactEmail.trim() || undefined,
            subject: form.subject.trim(),
            description: form.description.trim(),
          });
          toast.success('تعذر الإرسال؛ تم حفظ طلب الدعم محلياً وسيُرسل عند العودة');
          setLoading(false);
          return;
        } catch {
          setErrors({ form: 'تعذر حفظ الطلب محلياً' });
        }
      }
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
          <p className="mt-2 text-sm text-slate-600">رقم الطلب: <span className="numeric font-bold text-primary-700">#{ticketNumber}</span></p>
          <p className="mt-1 text-sm text-slate-500">سيتم التواصل معك في أقرب وقت بإذن الله.</p>
          <Button className="mt-5" onClick={close}>إغلاق</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {errors.form && <Alert>{errors.form}</Alert>}
          <p className="text-sm text-slate-500">إذا تعذّر عليك تسجيل الدخول، أرسل لنا المشكلة وسنتواصل معك.</p>

          <Input label="الاسم" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} error={errors.contactName} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="رقم الجوال" value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} error={errors.contactPhone} hint={PHONE_HINT} dir="ltr" />
            <Input label="البريد الإلكتروني" type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} error={errors.contactEmail} dir="ltr" />
          </div>
          <Input label="الموضوع" value={form.subject} onChange={(e) => set('subject', e.target.value)} error={errors.subject} placeholder="مثال: نسيت كلمة المرور" required />
          <Textarea label="وصف المشكلة" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} error={errors.description} required />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={close}>إلغاء</Button>
            <Button type="submit" loading={loading}>إرسال الطلب</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
