/** Student services only; staff/admin routes remain closed. */
export function canVisitStudentRoute(pathname, mustChangePassword = false) {
  if (mustChangePassword) return pathname === '/' || pathname === '/student';
  if (['/', '/student', '/my-files', '/profile', '/verify-profile', '/notifications', '/chat', '/support', '/about', '/donations', '/account-deletion', '/settings/offline', '/forbidden'].includes(pathname)) return true;
  return /^\/(chat|support)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(pathname);
}
