import { Link } from 'react-router-dom';
import { DEFAULT_SCHOOL_NAME } from '@/config/branding';
import { useAuthStore } from '@/store/auth';

const sections = [
  { title: 'قسم الإدارة', mark: '01', items: [
    ['الحلقات والكادر', 'تنظيم الحلقات والدورات والمحفظين والمشرفين والموظفين وحضور الكادر.'],
    ['شؤون الطلبة', 'إدارة ملفات الطلاب وحساباتهم، ومراجعة بياناتهم وطلبات النقل والفصل والشهادات.'],
    ['التحقق من البيانات', 'مراجعة تعديلات الطالب والمحفظ، ثم اعتمادها أو رفضها مع توضيح السبب قبل تحديث الملف.'],
    ['الإشعارات والإعلام', 'إرسال إشعار بعنوان ونص إلى الجميع أو أشخاص محددين، وتنظيم جدول الإعلام وجدول نظام المحفظين.'],
    ['التقارير والإعدادات', 'متابعة الإحصائيات وتصدير تقارير Excel، وإدارة الحسابات والصلاحيات وإعدادات المدرسة.'],
    ['طلبات كلمات المرور', 'استقبال طلبات استعادة الحساب، والتحقق من الهوية والتواصل مع صاحب الطلب وتحديث حالة المعالجة.'],
  ] },
  { title: 'قسم لجنة الاختبارات', mark: '02', items: [
    ['طلبات الاختبار', 'متابعة قائمة طلبات الاختبار المتاحة للجنة ومراجعة تفاصيلها.'],
    ['المواعيد والنتائج', 'تنظيم الاختبارات وتسجيل التقييم والنتائج وفق صلاحيات الحساب. تظهر المواعيد والنتائج للطالب ضمن ملفه.'],
  ] },
  { title: 'قسم الطلاب', mark: '03', items: [
    ['ملفي الدراسي', 'متابعة الحفظ والمراجعة والتسميع والحضور والغياب والاختبارات والنتائج.'],
    ['التحضير والاختبارات', 'عرض التحضير المطلوب وموعد الاختبار القادم والمدة المتبقية عليه.'],
    ['بياناتي وملفاتي', 'تقديم البيانات والتعديلات للإدارة للمراجعة، وطلب الملفات والشهادات ومتابعة حالتها.'],
    ['التواصل', 'التواصل مع المحفظ والمشرف والإدارة ضمن الصلاحيات، والاطلاع على الإشعارات والإعلانات.'],
  ] },
  { title: 'قسم المحفظ', mark: '04', items: [
    ['إدارة الحلقة', 'متابعة طلاب حلقاته وملفاتهم وتقدمهم، وتسجيل الحضور والغياب والتسميع.'],
    ['متابعة التعلم', 'تحديد التحضير ومتابعة الحفظ والمراجعة وطلبات الاختبار والتقارير المتاحة له.'],
    ['بياناتي والنظام', 'إرسال بياناته للتحقق والاطلاع على جدول نظام المحفظين والتذكيرات المرتبطة به.'],
    ['المراسلات', 'التواصل مع الإدارة والمحفظين وطلابه فقط وفق علاقته الحالية بهم.'],
  ] },
  { title: 'المشرف والخدمات المشتركة', mark: '05', items: [
    ['الإشراف', 'متابعة الحلقات والطلاب والمحفظين الواقعين ضمن نطاق إشرافه والتقارير المسموح بها.'],
    ['الدعم والطلبات', 'إرسال تذاكر الدعم ومتابعتها واستقبال تحديثات الطلبات بحسب الدور.'],
    ['بدون إنترنت', 'قراءة البيانات المحفوظة على الجهاز وحفظ العمليات المدعومة للإرسال عند الاتصال. أول تسجيل دخول وتنزيل البيانات يحتاجان الإنترنت.'],
    ['المزامنة', 'عند الاتصال تُقرأ البيانات من الخادم وتُحفظ محليًا. تُرسل التعديلات المعلقة وتُسحب التغييرات الجديدة دون إعادة تنزيل كامل البيانات في كل مرة.'],
  ] },
];
export default function AboutPage() {
  const user = useAuthStore(state => state.user);
  return <main dir="rtl" className="min-h-screen bg-[#f3f7f4] px-5 py-8 sm:py-14"><div className="mx-auto max-w-5xl">
    <Link to={user ? '/' : '/login'} className="mb-6 inline-flex min-h-11 items-center font-bold text-primary-800">← العودة</Link>
    <header className="relative overflow-hidden rounded-[2rem] bg-[#123c30] px-6 py-10 text-white sm:px-12">
      <img src="/brand-logo.png" alt="شعار المدرسة" className="mb-6 h-20 w-20 rounded-full bg-white p-1" />
      <p className="mb-3 text-sm text-emerald-100">{DEFAULT_SCHOOL_NAME}</p><h1 className="text-3xl font-extrabold leading-relaxed sm:text-4xl">معلومات عن البرنامج</h1>
      <p className="mt-4 max-w-2xl leading-8 text-emerald-50/85">مساحة واحدة لتنظيم التعليم في الحلقات؛ من أول تسجيل للطالب إلى متابعة الحفظ والاختبارات، وإدارة الكادر والتواصل والطلبات.</p>
      <nav aria-label="أقسام دليل البرنامج" className="mt-7 flex flex-wrap gap-2">{sections.map(section => <a key={section.mark} href={`#section-${section.mark}`} className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10">{section.title}</a>)}</nav>
    </header>
    {sections.map(section => <section id={`section-${section.mark}`} key={section.mark} className="scroll-mt-8 pt-10"><div className="mb-5 flex items-center gap-3"><span className="text-sm font-extrabold text-primary-600">{section.mark}</span><h2 className="text-2xl font-extrabold text-slate-900">{section.title}</h2></div><div className="grid gap-4 sm:grid-cols-2">{section.items.map(([title, text]) => <article key={title} className="rounded-2xl border border-slate-200/70 bg-white p-6"><h3 className="mb-3 font-bold text-primary-900">{title}</h3><p className="text-sm leading-8 text-slate-600">{text}</p></article>)}</div></section>)}
    <footer className="mt-10 border-t py-6 text-sm leading-7 text-slate-500">تختلف الأقسام المتاحة بحسب صلاحية الحساب. <Link to="/privacy" className="font-bold text-primary-700">سياسة الخصوصية</Link></footer>
  </div></main>;
}
