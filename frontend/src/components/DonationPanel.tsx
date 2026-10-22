import { useState, type FormEvent } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { savePendingSupport } from '@/lib/offline/pendingSupport';
import { Button, Input, Textarea } from '@/components/ui';
import { IconHeart, IconClipboard } from '@/components/ui/Icons';
import type { SchoolSettings } from '@/types';

const paymentMethods = [
  ['بنك فلسطين', 'donationBankPalestine'],
  ['البنك الإسلامي', 'donationIslamicBank'],
  ['جوال', 'donationJawwal'],
  ['محفظة PalPay', 'donationPalPay'],
] as const;

type Props = { settings?: Partial<SchoolSettings> | null; compact?: boolean };

export default function DonationPanel({ settings, compact = false }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  if (!settings) return null;

  const methods = paymentMethods.flatMap(([label, key]) => {
    const number = settings[key]?.trim();
    return number ? [{ label, number }] : [];
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) return;
    setSending(true);
    const payload = {
      requestId: globalThis.crypto?.randomUUID?.(),
      contactName: name.trim() || 'متبرع',
      contactPhone: phone.trim() || undefined,
      subject: 'ملاحظة تبرع',
      description: note.trim(),
    };
    try {
      if (!navigator.onLine) {
        await savePendingSupport(payload);
        setSent(true);
        toast.success('حُفظت ملاحظتك وستُرسل عند عودة الاتصال');
        return;
      }
      await api.post('/support/public', payload);
      setSent(true);
      toast.success('وصلت ملاحظتك إلى الإدارة');
    } catch (error) {
      if (!navigator.onLine || (axios.isAxiosError(error) && !error.response)) {
        try {
          await savePendingSupport(payload);
          setSent(true);
          toast.success('حُفظت ملاحظتك وستُرسل عند عودة الاتصال');
          return;
        } catch { /* report the original submission error below */ }
      }
      toast.error(apiError(error, 'تعذر إرسال الملاحظة'));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={`rounded-2xl border border-emerald-100 bg-white ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><IconHeart size={22} /></span>
        <div><h2 className="font-extrabold text-emerald-950">وسائل التبرع</h2><p className="mt-1 text-sm leading-6 text-slate-600">حوّل المساهمة إلى الحساب الرسمي للمدرسة عبر إحدى الوسائل التالية.</p></div>
      </div>
      {methods.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {methods.map(method => <PaymentMethod key={method.label} {...method} />)}
        </div>
      ) : <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">لم تُضف الإدارة أرقام الحسابات بعد. تواصل مع إدارة المدرسة للتأكد من طريقة المساهمة.</p>}
      {settings.donationMethod && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{settings.donationMethod}</p>}

      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-5">
        <h3 className="font-bold text-slate-800">إرسال رسالة أو ملاحظة للإدارة</h3>
        {sent ? <div role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-900">تم استلام ملاحظتك. إذا أرسلتها دون إنترنت فستُرسل تلقائيًا عند عودة الاتصال.</div> : (
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input label="الاسم (اختياري)" autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={120} />
            <Input label="رقم الجوال (اختياري)" type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} dir="ltr" maxLength={30} />
            <Textarea label="رسالتك أو ملاحظتك" value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={2000} required className="sm:col-span-2" />
            <div className="sm:col-span-2"><Button type="submit" loading={sending} disabled={!note.trim()}>إرسال للإدارة</Button></div>
          </form>
        )}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">تحقق من اسم المستفيد ورقم الحساب مع إدارة المدرسة قبل التحويل. لا تُدخل بيانات بطاقتك أو كلمة مرور محفظتك هنا.</p>
    </section>
  );
}

function PaymentMethod({ label, number }: { label: string; number: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(number); setCopied(true); toast.success('تم نسخ الرقم'); }
    catch { toast.error('تعذر النسخ؛ يمكنك تحديد الرقم ونسخه'); }
  }
  const bank = label.includes('بنك') || label.includes('البنك');
  return <article className={`donation-payment ${bank ? 'donation-payment-bank' : 'donation-payment-wallet'}`}>
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="donation-method-mark">{label === 'محفظة PalPay' ? 'P' : label === 'جوال' ? 'ج' : bank ? 'ب' : 'م'}</span>
      <div className="min-w-0"><p className="text-xs font-medium text-slate-500">{bank ? 'تحويل بنكي' : 'تحويل إلى المحفظة'}</p><h3 className="mt-0.5 text-base font-extrabold text-slate-800">{label}</h3></div>
    </div>
    <div className="donation-account-number">
      <p className="mb-2 text-xs font-semibold text-slate-500">{bank ? 'رقم الحساب / IBAN' : 'رقم التحويل'}</p>
      <p className="donation-number" dir="ltr">{number}</p>
    </div>
    <button type="button" onClick={copy} aria-label={`نسخ رقم ${label}`} className={`donation-copy-button ${copied ? 'donation-copy-done' : ''}`}><IconClipboard size={17} /><span aria-live="polite">{copied ? 'تم نسخ الرقم' : 'نسخ رقم التحويل'}</span></button>
  </article>;
}
