import { useEffect, useRef } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { backDestination } from '@/lib/back-navigation';

export default function NativeBackNavigation() {
  const location = useLocation(); const navigate = useNavigate();
  const lastBack = useRef(0);
  useEffect(() => { lastBack.current = 0; }, [location.key]);
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let active = true;
    const listener = NativeApp.addListener('backButton', () => {
      if (!active) return;
      // Dialogs already contain Escape handling and must close before navigation.
      if (document.querySelector('[role="dialog"], [aria-modal="true"], [data-back-dismiss]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
      else {
        const fallback = backDestination(location.pathname);
        if (fallback) navigate(fallback, { replace: true });
        else if (lastBack.current && performance.now() - lastBack.current < 2000) void NativeApp.exitApp();
        else { lastBack.current = performance.now(); toast('اضغط رجوع مرة أخرى للخروج', { id: 'android-back-exit', duration: 2000 }); }
      }
    });
    return () => { active = false; void listener.then(handle => handle.remove()); };
  }, [location.pathname, navigate]);
  return null;
}
