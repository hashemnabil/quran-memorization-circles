import { useEffect, useState } from 'react';
export type ThemeMode = 'system' | 'light' | 'dark';
function savedMode(): ThemeMode {
  try { const mode = localStorage.getItem('qc.theme'); return mode === 'light' || mode === 'dark' ? mode : 'system'; } catch { return 'system'; }
}
export function useThemeAppearance() {
  const [mode, setMode] = useState<ThemeMode>(savedMode);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || mode === 'system' && query.matches;
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply(); query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [mode]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === 'qc.theme' || event.key === null) setMode(savedMode()); };
    const localSync = (event: Event) => {
      const value = (event as CustomEvent).detail;
      setMode(value === 'light' || value === 'dark' || value === 'system' ? value : savedMode());
    };
    window.addEventListener('storage', sync);
    window.addEventListener('qc:theme-change', localSync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('qc:theme-change', localSync); };
  }, []);
}
export default function ThemeSelect() {
  const [mode, setMode] = useState<ThemeMode>(savedMode);
  return <label className="theme-control"><span className="sr-only">مظهر التطبيق</span><select aria-label="مظهر التطبيق" value={mode} onChange={event => {
    const value = event.target.value as ThemeMode; setMode(value);
    try { localStorage.setItem('qc.theme', value); } catch { /* Storage may be unavailable. */ }
    window.dispatchEvent(new CustomEvent('qc:theme-change', { detail: value }));
  }}><option value="system">حسب الجهاز</option><option value="light">نهاري</option><option value="dark">ليلي</option></select></label>;
}
