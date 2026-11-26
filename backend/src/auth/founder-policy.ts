/** Normal account-management APIs may never provision or change ownership. */
export function canManageAccount(targetRole?: string, requestedRole?: string): boolean {
  return targetRole !== 'FOUNDER' && requestedRole !== 'FOUNDER';
}

/** The founder can manage the school; founder-only routes remain private to that role. */
export function rolePermitted(actor: string, required: readonly string[]): boolean {
  if (!required.length) return true;
  if (required.includes('FOUNDER')) return required.includes(actor);
  return actor === 'ADMIN' || actor === 'FOUNDER' || required.includes(actor);
}
