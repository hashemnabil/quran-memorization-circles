import { useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { useCachedImage } from '@/hooks/useCachedImage';
import { api } from '@/lib/api';
import { IconMosque } from '@/components/ui/Icons';
import type { SchoolSettings } from '@/types';

const BRAND_CACHE_KEY = 'qc.schoolBranding';

type Branding = { name?: string; logoUrl?: string | null; mosqueName?: string | null };

function readCachedBranding(): Branding {
  try { return JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || '{}') as Branding; }
  catch { return {}; }
}

export default function AppLaunchGate({ children }: { children: ReactNode }) {
  return Capacitor.isNativePlatform() ? <NativeLaunchGate>{children}</NativeLaunchGate> : <>{children}</>;
}

function NativeLaunchGate({ children }: { children: ReactNode }) {
  const [onboardingDone, setOnboardingDone] = useState(() => {
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
    const timer = window.setTimeout(() => setShowSplash(false), 1700);
    return () => window.clearTimeout(timer);
  }, []);

  if (!onboardingDone && !showSplash) {
    return <FirstUseOnboarding onComplete={() => setOnboardingDone(true)} />;
  }

  return (
    <>
      {onboardingDone && children}
      {showSplash && (
        <div dir="rtl" role="status" aria-label="بدء التطبيق" className="fixed inset-0 z-[190] flex items-center justify-center overflow-hidden bg-[#f7faf8] px-6 text-center text-primary-800">
          <div className="launch-logo" aria-hidden="true">
            {logo && !logoFailed ? <img src={logo} alt="" onError={() => setLogoFailed(true)} className="h-36 w-36 object-contain" /> : <IconMosque size={96} />}
          </div>
        </div>
      )}
    </>
  );
}

import FirstUseOnboarding from './FirstUseOnboarding';
