import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/store/auth';
import { Spinner } from '@/components/ui';
import type { Role } from '@/types';

function FullScreenLoader() {
  return (
    <div className="grid h-screen place-items-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-primary-700">
        <Spinner size={34} />
        <p className="text-sm font-semibold text-slate-500">جارٍ التحميل...</p>
      </div>
    </div>
  );
}

/** Blocks anonymous visitors. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, status } = useAuthStore();
  const location = useLocation();

  if (status === 'idle' || status === 'loading') return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return <>{children}</>;
}

/**
 * Route-level role check. The API enforces the same rules, so this only keeps
 * the UI honest — it is never the sole line of defence.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}

/** Sends already-authenticated users away from the login screen. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, status } = useAuthStore();
  if (status === 'idle' || status === 'loading') return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}
