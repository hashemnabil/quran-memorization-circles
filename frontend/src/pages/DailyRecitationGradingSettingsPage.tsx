import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, ErrorState, Input, LoadingState, PageHeader } from '@/components/ui';

type GradingSettings = { mistakePenalty: number; warningPenalty: number; tajweedPenalty: number };
const defaults: GradingSettings = { mistakePenalty: 1, warningPenalty: 0.25, tajweedPenalty: 1 };

export default function DailyRecitationGradingSettingsPage() {
  const [values, setValues] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    api.get<GradingSettings>('/recitations/grading-settings').then(({ data }) => {
      if (active) setValues(data);
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch<GradingSettings>('/recitations/grading-settings', values);
      setValues(data);
      toast.success('تم حفظ إعدادات تقييم التسميع اليومي');
    } catch (reason) { toast.error(apiError(reason)); }
    finally { setSaving(false); }
  };
  if (loading) return <LoadingState rows={3} />;
  if (error) return <ErrorState message="تعذر تحميل إعدادات تقييم التسميع اليومي" onRetry={() => window.location.reload()} />;
  const set = (key: keyof GradingSettings, value: string) => setValues(current => ({ ...current, [key]: Number(value) }));
  return <div dir="rtl">
    <PageHeader title="تقييم التسميع اليومي" subtitle="تُطبق هذه الخصومات على التسميع اليومي فقط، ولا تؤثر في نتائج الاختبارات الرسمية." action={<Button onClick={save} loading={saving}>حفظ الإعدادات</Button>} />
    <Card title="الخصم لكل رصد" subtitle="يُحسب التقييم تلقائيًا من الآيات المسمّعة بعد تطبيق الخصومات، والنتيجة لا تقل عن صفر.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="الخصم لكل خطأ" type="number" min="0" max="100" step="0.25" value={values.mistakePenalty} onChange={event => set('mistakePenalty', event.target.value)} />
        <Input label="الخصم لكل تنبيه" type="number" min="0" max="100" step="0.25" value={values.warningPenalty} onChange={event => set('warningPenalty', event.target.value)} />
        <Input label="الخصم لكل حكم تجويد" type="number" min="0" max="100" step="0.25" value={values.tajweedPenalty} onChange={event => set('tajweedPenalty', event.target.value)} />
      </div>
      <p className="mt-4 text-sm text-slate-600">التقدير التلقائي حسب نسبة النقاط إلى عدد الآيات: ممتاز 95٪، جيد جدًا 85٪، جيد 70٪، مقبول 50٪، وما دون ذلك غير مرضٍ.</p>
      <Button className="mt-4" onClick={save} loading={saving}>حفظ الإعدادات</Button>
    </Card>
  </div>;
}
