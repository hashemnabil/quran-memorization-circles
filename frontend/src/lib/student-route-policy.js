/** Matches the student's existing academic/files/profile destinations only. */
export function canVisitStudentRoute(pathname, mustChangePassword = false) {
  if (mustChangePassword) return pathname === '/' || pathname === '/student';
  return ['/', '/student', '/my-files', '/profile', '/forbidden'].includes(pathname);
}
