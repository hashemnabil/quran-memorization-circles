import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Modal, Textarea } from '@/components/ui';

export type ReportTarget = { type: 'POST' | 'COMMENT' | 'STORY' | 'MESSAGE'; id: string; label?: string };

const reasons = [
  ['ABUSE', 'إساءة أو ألفاظ غير لائقة'],
  ['BULLYING', 'تنمّر أو مضايقة'],
  ['INAPPROPRIATE', 'محتوى غير مناسب'],
  ['SPAM', 'إزعاج أو محتوى مكرر'],
  ['IMPERSONATION', 'انتحال شخصية'],
  ['OTHER', 'سبب آخر'],
] as const;

export default function ReportContentDialog({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const report = useMutation({
    mutationFn: () => api.post('/moderation/reports', { targetType: target?.type, targetId: target?.id, reason, details: details.trim() || undefined }),
    onSuccess: response => { toast.success(response.data?.duplicate ? 'سبق أن أرسلت بلاغًا عن هذا المحتوى' : 'تم إرسال البلاغ إلى فريق الإشراف'); setReason(''); setDetails(''); onClose(); },
    onError: error => toast.error(apiError(error, 'تعذر إرسال البلاغ')),
  });
  return <Modal open={!!target} onClose={() => { if (!report.isPending) onClose(); }} title={`الإبلاغ عن ${target?.label || 'المحتوى'}`} size="sm">
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (reason) report.mutate(); }}>
      <p className="text-sm leading-7 text-slate-600">اختر السبب الأقرب. سيُراجع البلاغ بسرية، ولن يعرف صاحب المحتوى من أرسل البلاغ.</p>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-bold">سبب البلاغ</legend>{reasons.map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${reason === value ? 'border-primary-500 bg-primary-50' : 'border-slate-200'}`}><input type="radio" name="report-reason" value={value} checked={reason === value} onChange={() => setReason(value)}/><span>{label}</span></label>)}</fieldset>
      <Textarea label="تفاصيل إضافية (اختياري)" rows={3} maxLength={500} value={details} onChange={event => setDetails(event.target.value)} placeholder="اكتب ما يساعد المشرف على فهم المشكلة…"/>
      <div className="rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-900">في الرسائل الخاصة، لا يرى المشرف إلا الرسالة التي أبلغت عنها والسياق الضروري للقرار.</div>
      <div className="flex gap-2"><Button type="submit" loading={report.isPending} disabled={!reason}>إرسال البلاغ</Button><Button type="button" variant="secondary" disabled={report.isPending} onClick={onClose}>إلغاء</Button></div>
    </form>
  </Modal>;
}
