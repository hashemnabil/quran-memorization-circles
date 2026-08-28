import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { IconBell, IconExternal, IconX } from '@/components/ui/Icons';
import { isExternalLink } from '@/lib/format';
import type { Announcement } from '@/types';

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
  const userId = useAuthStore((s) => s.user?.id);

  const [dismissed, setDismissed] = useState<string[]>(() =>
    readDismissed(userId),
  );

  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);

  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed(userId));
  }, [userId]);

  const { data } = useQuery({
    queryKey: ['announcements', 'active'],
    queryFn: async () =>
      (await api.get<Announcement[]>('/announcements/active')).data,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // إظهار الإعلان الأقدم أولاً
  const visible = useMemo(
    () =>
      (data ?? [])
        .filter((a) => !dismissed.includes(a.id))
        .reverse(),
    [data, dismissed],
  );

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(
        dismissedKey(userId),
        JSON.stringify(next.slice(-100)),
      );
    } catch {
      // Ignore storage errors.
    }
  };

  if (!visible.length) {
    return null;
  }

  // 35 ثانية لكل إعلان لسرعة بطيئة ومريحة
  const durationPerAnnouncement = 35;
  const totalDuration = visible.length * durationPerAnnouncement;

  return (
    <>
      <div
        className="announcement-bar overflow-hidden border-b border-[#ded6c8] bg-[#f4efe6]"
        dir="rtl"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        <div className="flex h-11 items-center">
          {/* عنوان الإعلانات */}
          <div className="z-20 flex h-11 shrink-0 items-center gap-2 border-l border-[#ded6c8] bg-[#f4efe6] px-4 text-[#6f6252] shadow-[4px_0_10px_rgba(0,0,0,0.04)]">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e5dccd]">
              <IconBell size={15} />
            </span>
            <span className="hidden text-xs font-bold sm:inline">
              الإعلانات
            </span>
          </div>

          {/* منطقة الحركة */}
          <div className="relative h-11 min-w-0 flex-1 overflow-hidden">
            <div
              className={`announcement-track ${paused ? 'paused' : ''}`}
              style={
                {
                  '--total-duration': `${totalDuration}s`,
                } as React.CSSProperties
              }
            >
              {[...visible, ...visible].map((announcement, idx) => {
                const isLastInCycle = (idx + 1) % visible.length === 0;

                return (
                  <div
                    key={`${announcement.id}-${idx}`}
                    className={`announcement-item-wrapper ${
                      isLastInCycle ? 'last-in-cycle' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedAnnouncement(announcement)}
                      className="announcement-item"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#9b8d79]" />
                      <span className="shrink-0 text-sm font-bold text-[#51483d]">
                        {announcement.title}
                      </span>
                      {announcement.body && (
                        <>
                          <span className="text-[#b2a898]">—</span>
                          <span className="max-w-[70vw] overflow-hidden text-ellipsis text-sm text-[#756b60]">
                            {announcement.body}
                          </span>
                        </>
                      )}
                      <span className="shrink-0 text-[11px] font-semibold text-[#9b8d79]">
                        اضغط لعرض التفاصيل
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* زر إخفاء الإعلان */}
          <button
            type="button"
            onClick={() => dismiss(visible[0].id)}
            className="z-20 flex h-11 shrink-0 items-center justify-center border-r border-[#ded6c8] bg-[#f4efe6] px-3 text-[#9b9185] transition hover:bg-white hover:text-[#51483d]"
            aria-label="إخفاء الإعلان"
          >
            <IconX size={15} />
          </button>
        </div>
      </div>

      {/* نافذة تفاصيل الإعلان */}
      {selectedAnnouncement && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setSelectedAnnouncement(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-[#e8e1d7] bg-[#f4efe6] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e5dccd] text-[#6f6252]">
                  <IconBell size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-[#9b8d79]">إعلان</p>
                  <h2 className="text-lg font-bold text-[#403a34]">
                    {selectedAnnouncement.title}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="rounded-lg p-2 text-[#8e857b] transition hover:bg-white hover:text-[#403a34]"
                aria-label="إغلاق"
              >
                <IconX size={20} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
              {selectedAnnouncement.body ? (
                <div className="whitespace-pre-wrap text-sm leading-8 text-[#51483d]">
                  {selectedAnnouncement.body}
                </div>
              ) : (
                <p className="text-sm text-[#8e857b]">
                  لا يوجد محتوى إضافي لهذا الإعلان.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#e8e1d7] bg-[#faf8f5] px-5 py-4">
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="rounded-xl border border-[#ddd4c7] px-4 py-2 text-sm font-semibold text-[#62594f] transition hover:bg-white"
              >
                إغلاق
              </button>
              {selectedAnnouncement.link && (
                <button
                  type="button"
                  onClick={() => {
                    const link = selectedAnnouncement.link;
                    if (!link) return;
                    if (isExternalLink(link)) {
                      window.open(link, '_blank', 'noopener,noreferrer');
                    } else {
                      window.location.href = link;
                    }
                  }}
                  className="flex items-center gap-2 rounded-xl bg-[#756858] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#62574a]"
                >
                  فتح الرابط
                  <IconExternal size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSS التحديث: ضبط مسافة الفاصل لنصف شريط الإعلانات */}
      <style>{`
        .announcement-track {
          display: flex;
          height: 44px;
          align-items: center;
          width: max-content;
          animation: scroll-right-to-left var(--total-duration, 40s) linear infinite;
          will-change: transform;
        }

        .announcement-track.paused {
          animation-play-state: paused;
        }

        .announcement-item-wrapper {
          display: flex;
          height: 44px;
          align-items: center;
          flex-shrink: 0;
          padding-left: 80px;
        }

        /* التعديل: تتبع مسافة الفاصل 50% من شريط الإعلانات المتاح بالضبط */
        .announcement-item-wrapper.last-in-cycle {
          padding-left: calc(50cqw); 
        }

        /* fallback للأجهزة التي لا تدعم container query width */
        @supports not (padding-left: 50cqw) {
          .announcement-item-wrapper.last-in-cycle {
            padding-left: 50vw;
          }
        }

        .announcement-item {
          display: flex;
          height: 44px;
          align-items: center;
          gap: 12px;
          white-space: nowrap;
          padding: 0;
          text-align: right;
          background-color: transparent;
          transition: opacity 0.2s ease;
          cursor: pointer;
        }

        .announcement-item:hover {
          opacity: 0.8;
        }

        @keyframes scroll-right-to-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(50%);
          }
        }

        @media (max-width: 640px) {
          .announcement-item-wrapper {
            padding-left: 40px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .announcement-track {
            animation: none;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
