import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, LoadingState, PageHeader, Textarea } from '@/components/ui';
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
      setForm(Object.fromEntries(Object.entries({ ...EMPTY, ...data }).map(([k, v]) => [k, v ?? ''])));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.patch('/settings', form),
    onSuccess: () => {
      toast.success('تم حفظ الإعدادات');
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
    onSuccess: () => {
      toast.success('تم رفع الشعار');
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
        subtitle="البيانات العامة والشعار ووسائل التواصل"
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
              <img
                src={data.logoUrl}
                alt="شعار المدرسة"
                className="h-32 w-32 rounded-2xl border border-slate-100 object-contain p-2"
              />
            ) : (
              <span className="grid h-32 w-32 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                <IconMosque size={48} />
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo.mutate(file);
                e.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              icon={<IconPlus size={16} />}
              onClick={() => fileRef.current?.click()}
              loading={uploadLogo.isPending}
            >
              رفع شعار جديد
            </Button>
            <p className="text-center text-[11px] leading-5 text-slate-400">
              الصيغ المدعومة: PNG, JPG, WEBP, SVG
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

      <div className="mt-5 text-left">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          حفظ التغييرات
        </Button>
      </div>
    </>
  );
}
