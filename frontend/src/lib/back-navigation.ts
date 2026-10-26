/** Deep-link fallback when there is no earlier entry in the application. */
export function backDestination(path: string): string | null {
  if (['/', '/student', '/login'].includes(path)) return null;
  if (path.startsWith('/profile/settings/')) return '/profile/settings';
  if (path === '/profile/settings') return '/profile';
  if (/^\/chat\/[^/]+/.test(path)) return '/chat';
  if (/^\/circles\/[^/]+/.test(path)) return '/circles';
  if (/^\/students\/[^/]+/.test(path)) return '/students';
  if (/^\/courses\/[^/]+/.test(path)) return '/courses';
  if (/^\/support\/[^/]+/.test(path)) return '/support';
  return '/';
}
