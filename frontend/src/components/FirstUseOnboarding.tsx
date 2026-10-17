import { useState } from 'react';
import { IconChevronLeft } from '@/components/ui/Icons';

const slides = [
  { image: '/onboarding/quran-mosque.jpg', tag: 'رحلة مع القرآن', title: 'كل آية، خطوة إلى الأمام', text: 'حلقتك وحفظك ومراجعتك في مساحة واحدة، قريبة منك في كل يوم.' },
  { image: '/onboarding/quran-study.jpg', tag: 'يوم واضح ومنظّم', title: 'اعرف خطوتك القادمة', text: 'تابع التحضير ومواعيد الاختبارات، واستقبل تنبيهات المدرسة وتواصل مع فريقك.' },
  { image: '/onboarding/quran-detail.jpg', tag: 'معك أينما كنت', title: 'تعلّمك يستمر', text: 'بياناتك المحفوظة متاحة دون إنترنت. وعند الاتصال، تصل التعديلات الجديدة تلقائيًا.' },
];

export default function FirstUseOnboarding({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const finish = () => {
    try { localStorage.setItem('qc.onboarding.completed', '1'); } catch { /* Storage is optional. */ }
    onComplete();
  };
  return <main dir="rtl" aria-label="التعريف بالتطبيق" className="welcome-screen">
    <div className="welcome-photo" key={slide.image} aria-hidden="true"><img src={slide.image} alt="" /></div>
    <header className="relative z-10 flex items-center justify-between gap-4"><img src="/brand-logo.png" alt="شعار المدرسة" className="h-14 w-14 rounded-full bg-white p-1" /><button type="button" onClick={finish} className="min-h-11 rounded-full border border-white/30 bg-black/10 px-5 text-sm text-white backdrop-blur-sm">تخطي</button></header>
    <section key={index} className="welcome-content relative z-10 motion-safe:animate-fade-in" aria-live="polite">
      <p className="mb-4 text-sm font-bold tracking-wide text-[#e7ca83]">{slide.tag}</p>
      <h1 className="max-w-sm text-4xl font-extrabold leading-[1.6]">{slide.title}</h1>
      <p className="mt-4 max-w-sm text-base leading-8 text-white/80">{slide.text}</p>
    </section>
    <footer className="relative z-10 w-full max-w-md self-center">
      <div className="mb-7 flex justify-start gap-2" aria-label={`الخطوة ${index + 1} من ${slides.length}`}>{slides.map((item, step) => <button type="button" key={item.title} aria-label={`عرض الخطوة ${step + 1}`} aria-current={step === index ? 'step' : undefined} onClick={() => setIndex(step)} className="flex h-11 items-center px-1"><span className={`block h-1.5 rounded-full transition-all ${step === index ? 'w-8 bg-[#e7ca83]' : 'w-3 bg-white/30'}`} /></button>)}</div>
      <div className="flex gap-3">{index > 0 && <button type="button" onClick={() => setIndex(index - 1)} className="min-h-14 rounded-2xl border border-white/20 px-5 font-semibold">السابق</button>}<button type="button" onClick={() => index === slides.length - 1 ? finish() : setIndex(index + 1)} className="flex min-h-14 flex-1 items-center justify-center gap-3 rounded-2xl bg-white px-5 font-bold text-primary-900 shadow-lg">{index === slides.length - 1 ? 'ابدأ الآن' : 'متابعة'}<IconChevronLeft size={18} /></button></div>
    </footer>
  </main>;
}
