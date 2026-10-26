import { Link, useNavigate } from 'react-router-dom';
import ThemeSelect from '@/components/ThemeSelect';
import FirstUseOnboarding from '@/components/FirstUseOnboarding';
import { Card, PageHeader } from '@/components/ui';

export function IntroductionPage() {
  const navigate = useNavigate();
  return <FirstUseOnboarding onComplete={() => navigate('/profile/settings', { replace: true })} />;
}

export default function PersonalSettingsPage() {
  return <div dir="rtl" className="space-y-5">
    <PageHeader title="إعدادات الحساب" subtitle="تفضيلاتك على هذا الجهاز" />
    <Card title="المظهر"><p className="mb-3 text-sm">اختر المظهر الفاتح أو الداكن أو مظهر الجهاز. يُحفظ اختيارك دون إنترنت.</p><ThemeSelect /></Card>
    <Card title="الإشعارات"><Link className="btn-secondary inline-flex" to="/profile/settings/notifications/sound">إعدادات صوت الإشعارات</Link></Card>
    <Card title="التعريف بالتطبيق"><Link className="btn-secondary inline-flex" to="/profile/settings/introduction">إعادة مشاهدة شرح التطبيق</Link></Card>
    <Card title="البيانات المحلية"><Link className="btn-secondary inline-flex" to="/settings/offline">إدارة البيانات والعمليات المحلية</Link></Card>
    <Link className="inline-flex py-3 text-sm underline" to="/profile">العودة إلى الملف الشخصي وتعديل بيانات الحساب</Link>
  </div>;
}
