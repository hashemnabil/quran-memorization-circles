import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { canOpenPath } from '@/config/navigation';
import { IconBell, IconChevronLeft, IconChevronRight, IconExternal, IconX } from '@/components/ui/Icons';
import { isExternalLink } from '@/lib/format';
import type { Announcement } from '@/types';

/**
 * The announcements bar.
 *
 * Only the administration publishes; the backend already filters by audience,
 * so whatever arrives here is meant for this user. Clicking an announcement
 * navigates to the page it points at — a new course goes to /courses, a new
 * circle to /circles, and so on — or opens an outside address in a new tab,
 * leaving the app where it was.
 *
 * Dismissals are remembered per announcement id, so a notice a user has already
 * read and closed does not reappear on every page load. They are keyed by user:
 * a mosque office shares one browser between the administration, the teachers
 * and visiting parents, and one person closing a notice must not close it for
 * everyone who signs in after them.
 */
const DISMISSED_PREFIX = 'qc.dismissedAnnouncements';

const dismissedKey = (userId?: string) =>
  userId ? `${DISMISSED_PREFIX}.${userId}` : DISMISSED_PREFIX;

function readDismissed(userId?: string): string[] {
  try {
    const raw = localStorage.getItem(dismissedKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export default function AnnouncementBar() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.user?.role);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(userId));
  const [index, setIndex] = useState(0);

  // Signing in as somebody else on the same tab brings their own list.
  useEffect(() => {
    setDismissed(readDismissed(userId));
    setIndex(0);
  }, [userId]);

  const { data } = useQuery({
    queryKey: ['announcements', 'active'],
    queryFn: async () => (await api.get<Announcement[]>('/announcements/active')).data,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const visible = (data ?? []).filter((a) => !dismissed.includes(a.id));

  // Keep the cursor inside the list when one is dismissed or the list refreshes.
  useEffect(() => {
    if (index >= visible.length) setIndex(0);
  }, [visible.length, index]);

  if (!visible.length) return null;

  const current = visible[Math.min(index, visible.length - 1)];

  /**
   * A link is only offered to someone who can actually follow it.
   *
   * The same notice goes to several roles at once — "a new course has opened"
   * is for the whole school — but the page behind it may not exist for all of
   * them. A parent following `/courses` used to land on «لا تملك صلاحية
   * الوصول», so for them the announcement is now simply text: still shown,
   * still theirs, just not a door into a wall.
   */
  const reachable =
    !!current.link && (isExternalLink(current.link) || !role || canOpenPath(role, current.link));

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      // Capped so the list cannot grow without bound over years of use.
      localStorage.setItem(dismissedKey(userId), JSON.stringify(next.slice(-100)));
    } catch {
      /* storage unavailable: the notice simply comes back next time */
    }
  };

  const open = () => {
    if (!current.link || !reachable) return;
    if (isExternalLink(current.link)) {
      // `noopener` matters: without it the opened page can reach back through
      // `window.opener` and navigate this tab.
      window.open(current.link, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(current.link);
  };

  return (
    <div className="border-b border-gold-200/70 bg-gradient-to-l from-gold-50 via-gold-50/70 to-white">
      <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gold-400/20 text-gold-700">
          <IconBell size={15} />
        </span>

        <button
          type="button"
          onClick={open}
          disabled={!reachable}
          className={`min-w-0 flex-1 text-right ${reachable ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className="block truncate text-sm font-bold text-slate-800">{current.title}</span>
          {current.body && (
            <span className="block truncate text-xs text-slate-500">{current.body}</span>
          )}
        </button>

        {visible.length > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + visible.length) % visible.length)}
              className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
              aria-label="الإعلان السابق"
            >
              <IconChevronRight size={15} />
            </button>
            <span className="numeric text-[11px] font-semibold text-slate-400">
              {index + 1}/{visible.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % visible.length)}
              className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
              aria-label="الإعلان التالي"
            >
              <IconChevronLeft size={15} />
            </button>
          </div>
        )}

        {reachable && (
          <button
            type="button"
            onClick={open}
            className="hidden shrink-0 items-center gap-1 rounded-lg bg-gold-500 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-gold-600 sm:flex"
          >
            {isExternalLink(current.link) ? 'فتح الرابط' : 'عرض التفاصيل'}
            {isExternalLink(current.link) && <IconExternal size={12} />}
          </button>
        )}

        <button
          type="button"
          onClick={() => dismiss(current.id)}
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
          aria-label="إخفاء الإعلان"
        >
          <IconX size={15} />
        </button>
      </div>
    </div>
  );
}
