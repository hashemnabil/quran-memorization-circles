import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { backAction } from '@/lib/back-navigation';
import { useAuthStore } from '@/store/auth';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';

export default function NativeBackNavigation() {
  const location = useLocation(); const navigate = useNavigate();
  const home = useAuthStore(state => state.user?.role === 'STUDENT' ? '/student' : '/');
  const lastExit = useRef(0);
  const entries = useRef(new Map<number, string>());
  const index = window.history.state?.idx ?? 0;
  entries.current.set(index, location.pathname);
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let active = true;
    const listener = NativeApp.addListener('backButton', () => {
      if (!active) return;
      if (document.querySelector('[data-security-blocked]')) return;
      // Dialogs already contain Escape handling and must close before navigation.
      if (document.querySelector('[role="dialog"], [aria-modal="true"], [data-back-overlay]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      const idx = window.history.state?.idx ?? 0;
      const action = backAction(location.pathname, idx, entries.current.get(idx - 1), Date.now(), lastExit.current, home);
      if (action.kind === 'history') navigate(-1);
      else if (action.kind === 'parent') navigate(action.to, { replace: true });
      else if (action.kind === 'exit') void NativeApp.exitApp();
      else { lastExit.current = Date.now(); toast('اضغط رجوع مرة أخرى للخروج', { id: 'android-back', duration: 2000 }); }
    });
    return () => { active = false; void listener.then(handle => handle.remove()); };
  }, [location.pathname, navigate, home]);
  return null;
}
