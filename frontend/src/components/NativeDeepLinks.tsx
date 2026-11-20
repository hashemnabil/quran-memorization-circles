import { useEffect } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { nativeRouteFromUrl } from '@/lib/app-links';

export default function NativeDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const open = (url?: string) => {
      const route = url ? nativeRouteFromUrl(url) : null;
      if (route) navigate(route);
    };
    const listener = NativeApp.addListener('appUrlOpen', event => open(event.url));
    void NativeApp.getLaunchUrl().then(result => open(result?.url));
    return () => { void listener.then(handle => handle.remove()); };
  }, [navigate]);

  return null;
}
