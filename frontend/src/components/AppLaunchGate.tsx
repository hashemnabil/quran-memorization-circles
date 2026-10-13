import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { SchoolSettings } from '@/types';

const BRAND_CACHE_KEY = 'qc.schoolBranding';
const APP_NAME = 'حلقات تحفيظ السوسي';

type Branding = { name?: string; logoUrl?: string | null; mosqueName?: string | null };

function readCachedBranding(): Branding {
  try { return JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || '{}') as Branding; }
  catch { return {}; }
}

export default function AppLaunchGate({ children }: { children: ReactNode }) {
  const [onboardingDone, setOnboardingDone] = useState(() => {
    try { return localStorage.getItem('qc.onboarding.completed') === '1'; } catch { return false; }
  });
  const [showSplash, setShowSplash] = useState(true);
  const [branding, setBranding] = useState<Branding>(readCachedBranding);

  useEffect(() => {
    let active = true;
    api.get<SchoolSettings>('/settings/public', { timeout: 5000 }).then(({ data }) => {
      if (!active) return;
      const next: Branding = { name: data.name, logoUrl: data.logoUrl, mosqueName: data.mosqueName };
      setBranding(next);
      try { localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(next)); } catch { /* Best-effort offline branding. */ }
    }).catch(() => { /* Cached school branding is used while offline. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!onboardingDone) return;
    const timer = window.setTimeout(() => setShowSplash(false), 1700);
    return () => window.clearTimeout(timer);
  }, [onboardingDone]);

  if (!onboardingDone) {
    return <FirstUseOnboarding onComplete={() => { setOnboardingDone(true); setShowSplash(true); }} />;
  }

  return (
    <>
      {children}
      {showSplash && (
        <div dir="rtl" role="status" aria-label="بدء التطبيق" className="fixed inset-0 z-[190] flex items-center justify-center bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-800 px-6 text-center text-white">
          <div className="flex max-w-sm flex-col items-center">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.name || 'شعار المدرسة'} className="mb-6 h-28 w-28 rounded-3xl bg-white p-3 object-contain shadow-2xl" />
            ) : (
              <div className="mb-6 grid h-28 w-28 place-items-center rounded-3xl border border-amber-200/40 bg-white/10 text-5xl shadow-2xl">🕌</div>
            )}
            <h1 className="text-xl font-extrabold leading-relaxed">{branding.name || branding.mosqueName || 'عبدالله بن عمر'}</h1>
            <div className="my-5 h-px w-20 bg-amber-300/80" />
            <p className="text-lg font-bold text-amber-200">{APP_NAME}</p>
            <p className="mt-5 text-xs tracking-widest text-emerald-100/70">جاري تجهيز التطبيق</p>
          </div>
        </div>
      )}
    </>
  );
}

import FirstUseOnboarding from './FirstUseOnboarding';
