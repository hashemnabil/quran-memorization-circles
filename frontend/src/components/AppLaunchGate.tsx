import { useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { useCachedImage } from '@/hooks/useCachedImage';
import { api } from '@/lib/api';
import type { SchoolSettings } from '@/types';
import { DEFAULT_SCHOOL_LOGO, DEFAULT_SCHOOL_NAME, schoolName } from '@/config/branding';

const BRAND_CACHE_KEY = 'qc.schoolBranding';

type Branding = { name?: string; logoUrl?: string | null; mosqueName?: string | null };

function readCachedBranding(): Branding {
  try { const cached = JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || '{}') as Branding; return { ...cached, name: schoolName(cached.name) }; }
  catch { return {}; }
}

export default function AppLaunchGate({ children }: { children: ReactNode }) {
  return <NativeLaunchGate>{children}</NativeLaunchGate>;
}

function NativeLaunchGate({ children }: { children: ReactNode }) {
  const [onboardingDone, setOnboardingDone] = useState(() => {
    try { return localStorage.getItem('qc.onboarding.completed') === '1'; } catch { return false; }
  });
  const [showSplash, setShowSplash] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [leaving, setLeaving] = useState(false);
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
    if (reduced) { setShowSplash(false); return; }
    const duration = Capacitor.isNativePlatform() ? 900 : 560;
    const fade = window.setTimeout(() => setLeaving(true), duration - 120);
    const finish = window.setTimeout(() => setShowSplash(false), duration);
    return () => { window.clearTimeout(fade); window.clearTimeout(finish); };
  }, []);

  if (!onboardingDone && !showSplash) {
    return <FirstUseOnboarding onComplete={() => setOnboardingDone(true)} />;
  }

  return (
    <>
      {onboardingDone && children}
      {showSplash && (
        <div dir="rtl" role="status" aria-label="بدء التطبيق" className={`app-launch ${leaving ? 'is-leaving' : ''}`}>
          <div className="app-launch__emblem" aria-hidden="true">
            <span className="app-launch__ring" /><span className="app-launch__ring app-launch__ring--outer" />
            <div className="app-launch__logo">{logo && !logoFailed ? <img src={logo} alt="" onError={() => setLogoFailed(true)} /> : <img src={DEFAULT_SCHOOL_LOGO} alt="" />}</div>
          </div>
          <span className="app-launch__rule" aria-hidden="true" />
          <p className="app-launch__name">{branding.name || DEFAULT_SCHOOL_NAME}</p>
        </div>
      )}
    </>
  );
}

import FirstUseOnboarding from './FirstUseOnboarding';
