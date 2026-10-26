import { useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { useCachedImage } from '@/hooks/useCachedImage';
import { api } from '@/lib/api';
import type { SchoolSettings } from '@/types';
import { DEFAULT_SCHOOL_LOGO } from '@/config/branding';

const BRAND_CACHE_KEY = 'qc.schoolBranding';

type Branding = { name?: string; logoUrl?: string | null; mosqueName?: string | null };

function readCachedBranding(): Branding {
  try { return JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || '{}') as Branding; }
  catch { return {}; }
}

export default function AppLaunchGate({ children }: { children: ReactNode }) {
  return <NativeLaunchGate>{children}</NativeLaunchGate>;
}

function NativeLaunchGate({ children }: { children: ReactNode }) {
  const [onboardingDone, setOnboardingDone] = useState(() => {
    // Legal/public documents remain accessible without an introduction gate.
    if (['/privacy', '/about', '/account-deletion', '/contribute'].includes(window.location.pathname)) return true;
    try { return localStorage.getItem('qc.onboarding.completed') === '1'; } catch { return false; }
  });
  const [showSplash, setShowSplash] = useState(true);
  const [branding, setBranding] = useState<Branding>(readCachedBranding);
  const logo = useCachedImage(branding.logoUrl);
  const [logoFailed, setLogoFailed] = useState(false);

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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setShowSplash(false), reduced ? 0 : Capacitor.isNativePlatform() ? 850 : 450);
    return () => window.clearTimeout(timer);
  }, []);

  if (!onboardingDone && !showSplash) {
    return <FirstUseOnboarding onComplete={() => setOnboardingDone(true)} />;
  }

  return (
    <>
      {onboardingDone && children}
      {showSplash && (
        <div dir="rtl" role="status" aria-label="بدء التطبيق" className="fixed inset-0 z-[190] flex flex-col items-center justify-center gap-6 overflow-hidden bg-[#103c30] px-6 text-center text-[#e7ce95]">
          <div className="launch-logo" aria-hidden="true">
            {logo && !logoFailed ? <img src={logo} alt="" onError={() => setLogoFailed(true)} className="h-36 w-36 object-contain" /> : <img src={DEFAULT_SCHOOL_LOGO} alt="" className="h-36 w-36 object-contain" />}
          </div>
          <p className="launch-logo max-w-sm text-lg font-bold leading-8">مدرسة عبدالله بن عمر لتحفيظ القرآن الكريم</p>
        </div>
      )}
    </>
  );
}

import FirstUseOnboarding from './FirstUseOnboarding';
