import { Capacitor } from '@capacitor/core';

export const productionSiteOrigin = 'https://quran-frontend-sknr.onrender.com';

export function publicSiteOrigin() {
  const configured = import.meta.env.VITE_SITE_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  return Capacitor.isNativePlatform() ? productionSiteOrigin : window.location.origin;
}

export function groupInviteUrl(code: string) {
  return `${publicSiteOrigin()}/chat?join=${encodeURIComponent(code)}`;
}

export function nativeRouteFromUrl(value: string) {
  try {
    const url = new URL(value);
    const isVerifiedWebLink = url.protocol === 'https:' && url.origin === productionSiteOrigin;
    const isCustomAppLink = url.protocol === 'halaqat:' && url.hostname === 'chat';
    if (isVerifiedWebLink && /^\/chat(?:\/[^/]+)?$/.test(url.pathname)) {
      return `${url.pathname}${url.search}`;
    }
    if (isCustomAppLink && (url.pathname === '' || url.pathname === '/' || /^\/[^/]+$/.test(url.pathname))) {
      return `/chat${url.pathname === '/' ? '' : url.pathname}${url.search}`;
    }
  } catch { /* Ignore malformed or untrusted URLs. */ }
  return null;
}
