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
        <div dir="rtl" role="status" aria-label="بدء التطبيق" className="fixed inset-0 z-[190] flex items-center justify-center overflow-hidden bg-[#f5f7f2] px-6 text-center text-slate-900">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-l from-emerald-800 via-emerald-600 to-amber-400" />
          <div aria-hidden className="pointer-events-none absolute -top-28 -left-20 h-72 w-72 rounded-full bg-emerald-100/80 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-amber-100/80 blur-3xl" />
          <div className="relative flex w-full max-w-sm flex-col items-center rounded-[2rem] border border-emerald-900/10 bg-white/85 px-7 py-10 shadow-xl shadow-emerald-950/10">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.name || 'شعار المدرسة'} className="mb-6 h-28 w-28 rounded-3xl border border-emerald-900/10 bg-white p-3 object-contain shadow-lg shadow-emerald-950/10" />
            ) : (
              <div className="mb-6 grid h-28 w-28 place-items-center rounded-3xl border border-emerald-900/10 bg-emerald-50 text-5xl shadow-lg shadow-emerald-950/10">🕌</div>
            )}
            <h1 className="text-xl font-extrabold leading-relaxed text-emerald-950">{branding.name || branding.mosqueName || 'عبدالله بن عمر'}</h1>
            <div className="my-5 h-1 w-16 rounded-full bg-gradient-to-l from-emerald-700 to-amber-400" />
            <p className="text-lg font-extrabold text-emerald-800">{APP_NAME}</p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />جاري تجهيز التطبيق</p>
          </div>
        </div>
      )}
    </>
  );
}

import FirstUseOnboarding from './FirstUseOnboarding';
