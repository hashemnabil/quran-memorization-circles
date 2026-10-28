import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { transitionTheme } from '@/lib/theme-transition';
export type ThemeMode = 'system' | 'light' | 'dark';
function savedMode(): ThemeMode {
  try { const mode = localStorage.getItem('qc.theme'); return mode === 'light' || mode === 'dark' ? mode : 'system'; } catch { return 'system'; }
}
export function ThemeProvider() { useTheme(); return null; }
function useTheme() {
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
    const local = (event: Event) => {
      const selected = (event as CustomEvent<ThemeMode>).detail;
      setMode(['light', 'dark', 'system'].includes(selected) ? selected : savedMode());
    }; window.addEventListener('qc:theme', local); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('qc:theme', local); };
  }, []);
  return { mode, setMode };
}
export default function ThemeSelect() {
  const { mode, setMode } = useTheme();
  const choose = (value: ThemeMode, button: HTMLButtonElement) => {
    if (value === mode && !document.documentElement.dataset.themeTransition) return;
    const theme = value === 'dark' || value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    void transitionTheme(theme, button.querySelector('svg') || button, () => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      try { localStorage.setItem('qc.theme', value); } catch { /* Keep this visit usable when storage is unavailable. */ }
      flushSync(() => { setMode(value); window.dispatchEvent(new CustomEvent('qc:theme', { detail: value })); });
    });
  };
  return <div className="theme-control" role="group" aria-label="مظهر التطبيق">
    {(['light', 'dark', 'system'] as const).map(value => <button key={value} type="button" className="theme-option" aria-pressed={mode === value} onClick={event => choose(value, event.currentTarget)}>
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {value === 'dark' ? <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z" /> : value === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>}
      </svg>
      <span>{value === 'dark' ? 'ليلي' : value === 'light' ? 'نهاري' : 'حسب الجهاز'}</span>
    </button>)}
  </div>;
}
