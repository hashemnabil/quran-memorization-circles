import { useState, type FormEvent } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { savePendingSupport } from '@/lib/offline/pendingSupport';
import { Button, Input, Textarea } from '@/components/ui';
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
  if (!settings?.donationsEnabled) return null;

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
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-lg text-emerald-800">♡</span>
        <div><h2 className="font-extrabold text-emerald-950">وسائل التبرع</h2><p className="mt-1 text-sm leading-6 text-slate-600">حوّل المساهمة إلى الحساب الرسمي للمدرسة عبر إحدى الوسائل التالية.</p></div>
      </div>
      {methods.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {methods.map(method => <PaymentMethod key={method.label} {...method} />)}
        </div>
      ) : <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">لم تُضف الإدارة أرقام الحسابات بعد. تواصل مع إدارة المدرسة للتأكد من طريقة المساهمة.</p>}
      {settings.donationMethod && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{settings.donationMethod}</p>}
      {settings.donationLink && /^https?:\/\//i.test(settings.donationLink) && <a className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900" href={settings.donationLink} target="_blank" rel="noopener noreferrer">فتح رابط المساهمة الرسمي</a>}

      <div className="mt-5 border-t border-slate-100 pt-5">
        <h3 className="font-bold text-slate-800">إرسال رسالة أو ملاحظة للإدارة</h3>
        {sent ? <div role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-900">تم استلام ملاحظتك. إذا أرسلتها دون إنترنت فستُرسل تلقائيًا عند عودة الاتصال.</div> : (
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input label="الاسم (اختياري)" value={name} onChange={event => setName(event.target.value)} maxLength={120} />
            <Input label="رقم الجوال (اختياري)" value={phone} onChange={event => setPhone(event.target.value)} dir="ltr" maxLength={30} />
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
  async function copy() {
    try { await navigator.clipboard.writeText(number); toast.success('تم نسخ الرقم'); }
    catch { toast.error('تعذر النسخ؛ يمكنك تحديد الرقم ونسخه'); }
  }
  return <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
    <div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 break-all font-bold text-slate-800" dir="auto">{number}</p></div>
    <button type="button" onClick={copy} className="min-h-10 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-50">نسخ</button>
  </div>;
}
