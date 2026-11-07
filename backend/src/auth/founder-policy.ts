/** Normal account-management APIs may never provision or change ownership. */
export function canManageAccount(targetRole?: string, requestedRole?: string): boolean {
  return targetRole !== 'FOUNDER' && requestedRole !== 'FOUNDER';
}

/** Founder-only routes must not inherit the legacy administrator bypass. */
export function rolePermitted(actor: string, required: readonly string[]): boolean {
  if (!required.length) return true;
  if (required.includes('FOUNDER')) return required.includes(actor);
  return actor === 'ADMIN' || required.includes(actor);
}
