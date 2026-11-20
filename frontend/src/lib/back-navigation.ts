export function parentRoute(path: string, home = '/') {
  if (path === '/profile/settings' || path.startsWith('/profile/settings/')) return '/profile';
  if (path === '/settings/offline' || path === '/prayer-times/reminders') return path.startsWith('/prayer') ? '/prayer-times' : '/profile/settings';
  if (/^\/chat\/.+/.test(path)) return '/chat';
  if (/^\/community\/users\//.test(path)) return '/community';
  const parts = path.split('/').filter(Boolean);
  return parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : home;
}
export function backAction(path: string, index: number, previous: string | undefined, now: number, lastExit: number, home = '/') {
  if (index > 0 && previous !== '/login' && previous !== '/register') return { kind: 'history' as const };
  if (![home, '/', '/student', '/login'].includes(path)) return { kind: 'parent' as const, to: parentRoute(path, home) };
  return { kind: lastExit > 0 && now - lastExit < 2000 ? 'exit' as const : 'hint' as const };
}
