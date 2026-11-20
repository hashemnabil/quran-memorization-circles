import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export function usePageScroll(account: string) {
  const location = useLocation();
  const navigation = useNavigationType();
  const previousPath = useRef('');
  useLayoutEffect(() => {
    const storageKey = `qc.scroll:${account}`;
    let positions: Record<string, number> = {};
    try { positions = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch { /* best effort */ }
    const path = location.pathname;
    const key = `${location.key}:${path}${location.search}`;
    const samePage = previousPath.current === path;
    previousPath.current = path;
    const target = Math.max(0, Number(positions[navigation === 'POP' ? key : path]) || 0);
    let latest = window.scrollY;
    let restoring = !samePage;
    const previousMode = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const restore = () => {
      if (!restoring || document.documentElement.scrollHeight - window.innerHeight < target) return;
      window.scrollTo({ top: target, behavior: 'instant' }); latest = target; restoring = false;
    };
    const cancel = () => { restoring = false; };
    const record = () => { if (!restoring) latest = window.scrollY; };
    const persist = () => {
      positions[key] = latest; positions[path] = latest;
      try { sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(positions).slice(-100)))); } catch { /* storage may be unavailable */ }
    };
    restore();
    const observer = new ResizeObserver(restore);
    observer.observe(document.body);
    const timeout = setTimeout(cancel, 5000);
    window.addEventListener('scroll', record, { passive: true });
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    window.addEventListener('pagehide', persist);
    return () => {
      persist(); observer.disconnect(); clearTimeout(timeout);
      window.history.scrollRestoration = previousMode;
      window.removeEventListener('scroll', record); window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel); window.removeEventListener('keydown', cancel);
      window.removeEventListener('pagehide', persist);
    };
  }, [account, location.key, location.pathname, location.search, navigation]);
}
