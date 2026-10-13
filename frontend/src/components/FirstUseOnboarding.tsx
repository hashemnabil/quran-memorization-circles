import { useState } from 'react';

const INTRO_KEY = 'qc.onboarding.completed';

const slides = [
  { icon: '📖', title: 'أهلًا بك في حلقات تحفيظ السوسي', text: 'منصة تساعدك على تنظيم حلقات القرآن الكريم ومتابعة الحفظ والمراجعة.' },
  { icon: '🕌', title: 'تابع حلقتك بسهولة', text: 'تعرّف على صفحات التطبيق، والحضور، والتسميع، والتقدم المحفوظ في حسابك.' },
  { icon: '📶', title: 'يعمل حتى دون اتصال', text: 'يمكنك فتح التطبيق والاطلاع على البيانات التي سبق تحميلها. بعض التعديلات فقط تدعم الحفظ دون إنترنت حاليًا.' },
  { icon: '🔄', title: 'مزامنة عند عودة الإنترنت', text: 'التعديلات المدعومة تُحفظ على الجهاز وتحاول المزامنة تلقائيًا عندما يعود الاتصال. راجع حالة المزامنة قبل حذف التطبيق.' },
];

export default function FirstUseOnboarding({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];

  const finish = () => {
    try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* Continue if storage is restricted. */ }
    onComplete();
  };

  return (
    <main dir="rtl" className="fixed inset-0 z-[200] flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-800 px-6 py-10 text-white">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-amber-200/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full border border-amber-200/10" />
      <section className="relative flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-8 grid h-28 w-28 place-items-center rounded-[2rem] border border-amber-200/30 bg-white/10 text-5xl shadow-2xl shadow-black/20">{slide.icon}</div>
        <p className="mb-3 text-xs font-bold tracking-[.22em] text-amber-200">حلقات تحفيظ السوسي</p>
        <h1 className="text-2xl font-extrabold leading-relaxed">{slide.title}</h1>
        <p className="mt-4 min-h-24 text-base leading-8 text-emerald-50/90">{slide.text}</p>
        <div className="my-8 flex items-center justify-center gap-2" aria-label={`الشريحة ${index + 1} من ${slides.length}`}>
          {slides.map((item, i) => <span key={item.title} className={`h-2.5 rounded-full transition-all ${i === index ? 'w-8 bg-amber-300' : 'w-2.5 bg-white/35'}`} />)}
        </div>
        <div className="flex w-full gap-3">
          {index > 0 && <button type="button" onClick={() => setIndex((v) => v - 1)} className="min-h-12 flex-1 rounded-xl border border-white/25 px-4 font-bold hover:bg-white/10">السابق</button>}
          <button type="button" onClick={() => index === slides.length - 1 ? finish() : setIndex((v) => v + 1)} className="min-h-12 flex-1 rounded-xl bg-amber-300 px-4 font-extrabold text-emerald-950 shadow-lg hover:bg-amber-200">
            {index === slides.length - 1 ? 'ابدأ استخدام التطبيق' : 'التالي'}
          </button>
        </div>
        <button type="button" onClick={finish} className="mt-5 px-4 py-2 text-sm text-emerald-100/75 hover:text-white">تخطي التعليمات</button>
      </section>
    </main>
  );
}
