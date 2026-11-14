import type { AuthUser } from '../types';
export function readActiveIdentity(): AuthUser | null {
  try { return JSON.parse((typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('qc.activeIdentity')) || localStorage.getItem('qc.offlineUser') || 'null'); } catch { return null; }
}
export function cacheActiveIdentity(user: AuthUser) {
  const identity = { id: user.id, username: user.username, fullName: user.fullName, role: user.role, isActive: user.isActive, mustChangePassword: !!user.mustChangePassword };
  sessionStorage.setItem('qc.activeIdentity', JSON.stringify(identity));
  // Persistent routing metadata has no name, phone or profile contents.
  localStorage.setItem('qc.offlineUser', JSON.stringify({ id: user.id, role: user.role, isActive: user.isActive }));
}
export function clearActiveIdentity() { sessionStorage.removeItem('qc.activeIdentity'); localStorage.removeItem('qc.offlineUser'); }
