import { useEffect } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';

export default function NativeBackNavigation() {
  const location = useLocation(); const navigate = useNavigate();
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let active = true;
    const listener = NativeApp.addListener('backButton', () => {
      if (!active) return;
      // Dialogs already contain Escape handling and must close before navigation.
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
      else if (!['/', '/student', '/login'].includes(location.pathname)) navigate('/', { replace: true });
      // Stay at the app root. Android's Home button remains available to leave.
    });
    return () => { active = false; void listener.then(handle => handle.remove()); };
  }, [location.pathname, navigate]);
  return null;
}
