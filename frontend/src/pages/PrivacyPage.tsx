import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { SchoolSettings } from '@/types';

export default function PrivacyPage() {
  const user = useAuthStore(state => state.user);
  const { data } = useQuery({ queryKey: ['settings', 'public'], queryFn: async () => (await api.get<SchoolSettings>('/settings/public')).data });
  const sections = [
    ['البيانات التي يستخدمها النظام', 'تشمل بيانات الملف التي تدخلها أنت أو إدارة الحلقات، مثل الاسم وتاريخ الميلاد ورقم الهوية وبيانات ولي الأمر والتواصل، والصورة عند إضافتها، وسجلات الحضور والتسميع والاختبارات والدورات والطلبات والمحادثات.'],
    ['الغرض من الاستخدام', 'تُستخدم البيانات لإدارة التعليم في الحلقات، ومتابعة تقدم الطلاب، والتحقق من الملفات، وإصدار المستندات، ومعالجة الطلبات والتواصل مع المستخدمين.'],
    ['من يمكنه الوصول؟', 'يُحدّد الوصول بحسب صلاحية الحساب وعلاقته بالحلقات والطلاب. تتولى الإدارة إدارة الحسابات والسجلات، ويقتصر وصول المحفظ والمشرف والطالب على ما تسمح به مسؤولياتهم وصلاحياتهم.'],
    ['العمل دون إنترنت', 'يحتفظ التطبيق بنسخة محلية من البيانات المصرّح لحسابك بعرضها، وبالتعديلات التي تنتظر الإرسال. تسجيل الخروج لا يمسح جميع البيانات المحلية؛ استخدم جهازًا موثوقًا، ولا تمسح بيانات التطبيق قبل إرسال التعديلات المعلّقة.'],
    ['الاستضافة والإشعارات', 'يعتمد النظام على خدمات استضافة وقاعدة بيانات لتشغيله. عند تفعيل إشعارات الجوال، يُسجّل رمز الجهاز لإرسال الإشعارات عبر خدمات Google أو Apple. يمكنك إدارة إذن الإشعارات من إعدادات الجهاز.'],
    ['التصحيح وحذف الحساب والبيانات', 'يمكن للطالب والمحفظ تقديم تصحيح من قسم «تحقق من بياناتي». لطلب حذف الحساب أو البيانات، أو للاستفسار عن مدة الاحتفاظ بالسجلات، تواصل مع إدارة الحلقات أو الدعم الفني. تحدد الإدارة ما يمكن حذفه وما يلزم الاحتفاظ به من سجلات إدارية.'],
  ];
  return <main dir="rtl" className="min-h-[100dvh] bg-slate-50 px-5 py-10 sm:py-16">
    <article className="mx-auto max-w-3xl">
      <header className="mb-8"><p className="text-sm font-bold text-primary-700">{data?.name || 'حلقات تحفيظ السوسي'}</p><h1 className="mt-3 text-3xl font-extrabold text-slate-900">البيانات والخصوصية</h1></header>
      <div className="card divide-y divide-slate-100 px-6 sm:px-8">{sections.map(([title, body]) => <section key={title} className="py-6"><h2 className="mb-3 text-lg font-bold text-slate-800">{title}</h2><p className="text-sm leading-8 text-slate-600">{body}</p></section>)}</div>
      <footer className="mt-7 flex flex-wrap items-center gap-3">
        <Link className="btn-primary" to={user ? '/support' : '/login?support=1'}>التواصل مع الدعم الفني</Link>
        <Link className="btn-secondary" to={user ? '/' : '/login'}>العودة</Link>
        {data?.email && <a className="text-sm text-primary-700" href={`mailto:${data.email}`}>{data.email}</a>}
      </footer>
    </article>
  </main>;
}
