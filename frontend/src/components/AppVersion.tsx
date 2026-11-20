import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export default function AppVersion() {
  const [info, setInfo] = useState<{version: string; build?: string} | null>(() => Capacitor.isNativePlatform() ? null : {version: import.meta.env.VITE_APP_VERSION || 'غير متاح', build: import.meta.env.VITE_APP_BUILD});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    void App.getInfo().then(value => { if (active) setInfo(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <p className="text-sm text-slate-500" role="status">{info ? <>إصدار التطبيق <b dir="ltr">{info.version}</b>{info.build && <> · البناء <span dir="ltr">{info.build}</span></>}</> : failed ? 'تعذر قراءة إصدار التطبيق من نظام التشغيل' : 'جارٍ قراءة إصدار التطبيق…'}</p>;
}
