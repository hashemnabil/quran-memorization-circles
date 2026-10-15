import { useState } from 'react';
import { IconBook, IconClipboard, IconExchange, IconChevronLeft } from '@/components/ui/Icons';

const slides = [
  { icon: <IconBook size={64} />, title: 'حلقتك بين يديك', text: 'تابع الحفظ والمراجعة، واطّلع على تقدمك من مكان واحد.' },
  { icon: <IconClipboard size={64} />, title: 'يومك أكثر تنظيمًا', text: 'وصول واضح إلى الحضور والتسميع والمهام الخاصة بحسابك.' },
  { icon: <IconExchange size={64} />, title: 'بياناتك معك', text: 'افتح بياناتك المحفوظة بدون اتصال. تُرسل التعديلات المدعومة تلقائيًا عند رجوع الإنترنت.' },
];

export default function FirstUseOnboarding({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const finish = () => {
    try { localStorage.setItem('qc.onboarding.completed', '1'); } catch { /* Storage is optional. */ }
    onComplete();
  };
  return <main dir="rtl" aria-label="التعريف بالتطبيق" className="onboarding-screen">
    <header className="flex items-center justify-between gap-4"><span className="text-xs font-semibold text-primary-200">{index + 1} / {slides.length}</span><button type="button" onClick={finish} className="min-h-11 rounded-xl px-4 text-sm text-white/75 hover:bg-white/10">تخطي</button></header>
    <section key={index} className="my-auto flex flex-col items-center py-10 text-center motion-safe:animate-fade-in" aria-live="polite">
      <div className="onboarding-illustration" aria-hidden="true">{slide.icon}</div>
      <h1 className="mt-10 text-3xl font-extrabold leading-relaxed">{slide.title}</h1>
      <p className="mt-4 max-w-xs text-base leading-8 text-primary-100">{slide.text}</p>
    </section>
    <footer className="w-full max-w-md self-center">
      <div className="mb-7 flex justify-center gap-2" aria-label={`الخطوة ${index + 1} من ${slides.length}`}>{slides.map((item, step) => <span key={item.title} className={`h-1.5 rounded-full transition-all ${step === index ? 'w-7 bg-white' : 'w-1.5 bg-white/25'}`} />)}</div>
      <div className="flex gap-3">{index > 0 && <button type="button" onClick={() => setIndex(index - 1)} className="min-h-14 rounded-2xl border border-white/20 px-5 font-semibold">السابق</button>}<button type="button" onClick={() => index === slides.length - 1 ? finish() : setIndex(index + 1)} className="flex min-h-14 flex-1 items-center justify-center gap-3 rounded-2xl bg-white px-5 font-bold text-primary-900 shadow-lg">{index === slides.length - 1 ? 'ابدأ الآن' : 'متابعة'}<IconChevronLeft size={18} /></button></div>
    </footer>
  </main>;
}
