import { notifyWriteSuccess } from '@/lib/write-feedback';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, ImageThumb, Input, LoadingState, PageHeader, Textarea } from '@/components/ui';
import { IconMosque, IconPlus } from '@/components/ui/Icons';
import type { SchoolSettings } from '@/types';

const EMPTY: Partial<SchoolSettings> = {
  name: '',
  mosqueName: '',
  phone: '',
  email: '',
  address: '',
  about: '',
  academicYear: '',
  facebook: '',
  twitter: '',
  instagram: '',
  youtube: '',
  telegram: '',
  whatsapp: '',
  website: '',
  donationsEnabled: false,
  donationTitle: '',
  donationDescription: '',
  donationGoalAmount: null,
  donationRaisedAmount: null,
  donationCurrency: '',
  donationMethod: '',
  donationLink: '',
  donationBankPalestine: '',
  donationIslamicBank: '',
  donationJawwal: '',
  donationPalPay: '',
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Partial<SchoolSettings>>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<SchoolSettings>('/settings')).data,
  });

  useEffect(() => {
    if (data) {
      // Nulls from the API would make the inputs uncontrolled.
      setForm(Object.fromEntries(Object.entries({ ...EMPTY, ...data }).map(([k, v]) => [k, ['donationGoalAmount', 'donationRaisedAmount'].includes(k) ? v ?? null : v ?? ''])));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.patch('/settings', form),
    onSuccess: (_offlineWriteResult) => {
      notifyWriteSuccess(_offlineWriteResult, 'تم حفظ الإعدادات');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/settings/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (_offlineWriteResult) => {
      notifyWriteSuccess(_offlineWriteResult, 'تم رفع الشعار');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const removeLogo = useMutation({
    mutationFn: () => api.delete('/settings/logo'),
    onSuccess: (_offlineWriteResult) => {
      notifyWriteSuccess(_offlineWriteResult, 'تمت إزالة الشعار');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  if (isLoading) return <LoadingState rows={5} />;

  const set = (key: keyof SchoolSettings, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <>
      <PageHeader
        title="إعدادات المدرسة"
        subtitle="جميع البيانات اختيارية عدا اسم المدرسة — املأ ما يلزمك فقط"
        action={
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            حفظ التغييرات
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="الشعار" className="lg:col-span-1">
          <div className="flex flex-col items-center gap-4">
            {data?.logoUrl ? (
              /* Shown on its real proportions, the way it will look in the
                 sidebar and on the login screen — and clickable to enlarge.
                 The chequered ground is only here, so a transparent logo can be
                 told apart from a white one before it is published. */
              <span className="flex h-32 w-full items-center justify-center rounded-2xl border border-slate-100 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f5f9_75%),linear-gradient(-45deg,transparent_75%,#f1f5f9_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] p-3">
                <ImageThumb src={data.logoUrl} alt="شعار المدرسة" />
              </span>
            ) : (
              <span className="grid h-32 w-full place-items-center rounded-2xl bg-primary-50 text-primary-600">
                <IconMosque size={48} />
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo.mutate(file);
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                icon={<IconPlus size={16} />}
                onClick={() => fileRef.current?.click()}
                loading={uploadLogo.isPending}
              >
                رفع شعار جديد
              </Button>
              {data?.logoUrl && (
                <Button variant="ghost" onClick={() => removeLogo.mutate()} loading={removeLogo.isPending}>
                  إزالة الشعار
                </Button>
              )}
            </div>
            <p className="text-center text-[11px] leading-5 text-slate-400">
              الصيغ المدعومة: PNG, JPG, WEBP, SVG
              <br />
              يُفضّل شعار بخلفية شفافة وعرض لا يقل عن 400 بكسل
              <br />
              الحجم الأقصى 5 ميجابايت
            </p>
          </div>
        </Card>

        <Card title="البيانات العامة" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="اسم المدرسة" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} className="sm:col-span-2" />
            <Input label="اسم المسجد / الجامع" value={form.mosqueName ?? ''} onChange={(e) => set('mosqueName', e.target.value)} />
            <Input label="العام الدراسي" value={form.academicYear ?? ''} onChange={(e) => set('academicYear', e.target.value)} placeholder="1447 هـ" />
            <Input label="رقم الهاتف" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} dir="ltr" />
            <Input label="البريد الإلكتروني" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} dir="ltr" />
            <Input label="العنوان" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className="sm:col-span-2" />
            <Textarea
              label="نبذة عن المدرسة"
              rows={4}
              value={form.about ?? ''}
              onChange={(e) => set('about', e.target.value)}
              className="sm:col-span-2"
              hint="تظهر في شاشة تسجيل الدخول"
            />
          </div>
        </Card>

        <Card title="وسائل التواصل" className="lg:col-span-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="فيسبوك" value={form.facebook ?? ''} onChange={(e) => set('facebook', e.target.value)} dir="ltr" placeholder="https://facebook.com/..." />
            <Input label="تويتر / X" value={form.twitter ?? ''} onChange={(e) => set('twitter', e.target.value)} dir="ltr" placeholder="https://twitter.com/..." />
            <Input label="إنستغرام" value={form.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} dir="ltr" placeholder="https://instagram.com/..." />
            <Input label="يوتيوب" value={form.youtube ?? ''} onChange={(e) => set('youtube', e.target.value)} dir="ltr" placeholder="https://youtube.com/..." />
            <Input label="تيليجرام" value={form.telegram ?? ''} onChange={(e) => set('telegram', e.target.value)} dir="ltr" placeholder="https://t.me/..." />
            <Input label="واتساب" value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} dir="ltr" placeholder="05xxxxxxxx" />
            <Input label="الموقع الإلكتروني" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} dir="ltr" placeholder="https://..." className="sm:col-span-2 lg:col-span-3" />
          </div>
        </Card>
      </div>

      <Card title="إعدادات حملة التبرعات" className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 sm:col-span-2">
            <input type="checkbox" checked={!!form.donationsEnabled} onChange={event => setForm(current => ({ ...current, donationsEnabled: event.target.checked }))} />
            <span className="text-sm font-semibold text-slate-700">نشر حملة التبرعات لجميع المستخدمين</span>
          </label>
          <Input label="عنوان الحملة" value={form.donationTitle ?? ''} onChange={event => set('donationTitle', event.target.value)} className="sm:col-span-2" placeholder="مثال: دعم حلقات تعليم القرآن" />
          <Textarea label="عن الحملة وأوجه الصرف" rows={4} value={form.donationDescription ?? ''} onChange={event => set('donationDescription', event.target.value)} className="sm:col-span-2" />
          <Input label="الهدف المالي" type="number" min="0" value={form.donationGoalAmount ?? ''} onChange={event => setForm(current => ({ ...current, donationGoalAmount: event.target.value === '' ? null : Number(event.target.value) }))} />
          <Input label="المبلغ المجموع حتى الآن" type="number" min="0" value={form.donationRaisedAmount ?? ''} onChange={event => setForm(current => ({ ...current, donationRaisedAmount: event.target.value === '' ? null : Number(event.target.value) }))} />
          <Input label="العملة (اختياري)" value={form.donationCurrency ?? ''} onChange={event => set('donationCurrency', event.target.value)} placeholder="مثال: SAR أو JOD" />
          <Textarea label="طريقة المساهمة" rows={3} value={form.donationMethod ?? ''} onChange={event => set('donationMethod', event.target.value)} className="sm:col-span-2" hint="اكتب فقط الوسائل الرسمية التي تحققت منها الإدارة." />
          <div className="sm:col-span-2">
            <h3 className="mb-1 font-bold text-slate-800">حسابات ووسائل التبرع</h3>
            <p className="mb-3 text-sm text-slate-500">أدخل الرقم أو اسم الحساب المعتمد لكل وسيلة. اترك الحقل فارغًا لإخفائه عن المستخدمين.</p>
          </div>
          <Input label="بنك فلسطين" value={form.donationBankPalestine ?? ''} onChange={event => set('donationBankPalestine', event.target.value)} dir="auto" placeholder="رقم الحساب أو الآيبان" />
          <Input label="البنك الإسلامي" value={form.donationIslamicBank ?? ''} onChange={event => set('donationIslamicBank', event.target.value)} dir="auto" placeholder="رقم الحساب أو الآيبان" />
          <Input label="جوال باي" value={form.donationJawwal ?? ''} onChange={event => set('donationJawwal', event.target.value)} dir="auto" placeholder="رقم المحفظة أو الهاتف" />
          <Input label="محفظة PalPay" value={form.donationPalPay ?? ''} onChange={event => set('donationPalPay', event.target.value)} dir="auto" placeholder="رقم المحفظة" />
          <Input label="رابط المساهمة الرسمي (اختياري)" value={form.donationLink ?? ''} onChange={event => set('donationLink', event.target.value)} dir="ltr" className="sm:col-span-2" placeholder="https://..." />
          <p className="text-xs leading-6 text-slate-500 sm:col-span-2">المبلغ المجموع يُحدّث يدويًا من الإدارة. لا يجمع التطبيق بيانات البطاقات أو ينفذ تحويلات مالية.</p>
        </div>
      </Card>

      <div className="mt-5 text-left">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          حفظ التغييرات
        </Button>
      </div>
    </>
  );
}
