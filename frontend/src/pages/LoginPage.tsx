import axios from 'axios';
import PasswordRequestModal from '@/components/PasswordRequestModal';
import React, { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { IconAlert, IconEye, IconLifeBuoy } from '@/components/ui/Icons';
import { phoneError, PHONE_HINT, USERNAME_HINT } from '@/lib/validation';
import type { AuthUser, SchoolSettings } from '@/types';
import { savePendingSupport } from '@/lib/offline/pendingSupport';
import { BRANDING_CACHE_KEY, DEFAULT_SCHOOL_NAME, DEFAULT_SCHOOL_LOGO, cachedSchoolBranding } from '@/config/branding';

const DONATION_CACHE_KEY = 'qc.publicDonationInfo';

export default function LoginPage() {
  const navigate = useNavigate();
  const [cachedBranding] = useState(cachedSchoolBranding);
  const [passwordRequestOpen, setPasswordRequestOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(() => new URLSearchParams(window.location.search).get('support') === '1');

  const { data: settings } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => (await api.get<SchoolSettings>('/settings/public')).data,
    staleTime: 10 * 60 * 1000,
  });
  useEffect(() => {
    if (!settings?.name?.trim()) return;
    try { localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ name: settings.name, logoUrl: settings.logoUrl || DEFAULT_SCHOOL_LOGO })); } catch { /* Branding is optional when device storage is full. */ }
  }, [settings?.name, settings?.logoUrl]);
  useEffect(() => {
    if (!settings) return;
    const donationInfo = Object.fromEntries(['donationsEnabled', 'donationTitle', 'donationDescription', 'donationGoalAmount', 'donationRaisedAmount', 'donationCurrency', 'donationMethod', 'donationLink', 'donationBankPalestine', 'donationIslamicBank', 'donationJawwal', 'donationPalPay'].map(key => [key, (settings as any)[key]]));
    try { localStorage.setItem(DONATION_CACHE_KEY, JSON.stringify(donationInfo)); } catch { /* Public details are optional if storage is full. */ }
  }, [settings]);

  const onAuthenticated = (user: AuthUser) => {
    toast.success(`أهلاً بك، ${user.fullName}`);
    navigate('/', { replace: true });
  };

  return (
    <div className="login-screen" dir="rtl">
      <div className="login-panel">
        <header className="login-brand flex flex-col items-center text-center">
          <span className="login-brand-mark"><img src={settings?.logoUrl || cachedBranding.logoUrl || DEFAULT_SCHOOL_LOGO} alt="شعار المدرسة" width={144} height={144} onError={event => { if (!event.currentTarget.src.endsWith(DEFAULT_SCHOOL_LOGO)) event.currentTarget.src = DEFAULT_SCHOOL_LOGO; }} className="h-full w-full object-contain" /></span>
          <h1 className="login-school-name">{settings?.name?.trim() || cachedBranding.name || DEFAULT_SCHOOL_NAME}</h1>
          <p className="login-brand-caption">رحلتك مع القرآن، خطوة كل يوم</p>
        </header>
        <p className="login-intro">أهلًا بعودتك، سجّل دخولك لمتابعة رحلتك مع القرآن الكريم.</p>
        <CredentialsStep onAuthenticated={onAuthenticated} />
        <div className="login-secondary-actions">
        <button type="button" onClick={() => setPasswordRequestOpen(true)} className="mt-3 min-h-11 w-full rounded-xl text-sm font-bold text-primary-700 hover:bg-primary-50">طلب تغيير كلمة المرور</button>
        <button type="button" onClick={() => setSupportOpen(true)} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-primary-800"><IconLifeBuoy size={18} />الدعم الفني</button>
        <Link to="/about" className="mt-2 block py-2 text-center text-xs font-semibold text-slate-500 hover:text-primary-800">معلومات عن البرنامج</Link>
        </div>
        <Link to="/contribute" aria-label="المساهمة والتبرع" className="login-donation"><span className="login-donation-icon" aria-hidden="true">♡</span><span><strong>ساهم في رحلة تعليم القرآن</strong><small>المساهمة والتبرع للمدرسة</small></span><span aria-hidden="true">←</span></Link>
      </div>
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
      {passwordRequestOpen && <PasswordRequestModal open onClose={() => setPasswordRequestOpen(false)} />}
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

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="relative">
          <Input label="اسم المستخدم" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="اسم المستخدم أو رقم الطالب" autoComplete="username" dir="ltr" />
        </div>

        <div className="relative">
          <Input label="كلمة المرور" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" dir="ltr" className="[&_input]:pl-12" />
          <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPassword} className="absolute bottom-1 left-1 grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary-800"><IconEye size={19} /></button>
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
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
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
