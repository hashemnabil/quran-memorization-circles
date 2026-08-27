import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { formatDateTime, isExternalLink } from '@/lib/format';
import { rolesWithoutAccess } from '@/config/navigation';
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { IconAlert, IconBell, IconPlus, IconTrash } from '@/components/ui/Icons';
import type { Announcement, PaginatedResponse, Role } from '@/types';

const AUDIENCE_ROLES: Role[] = [
  'ADMIN',
  'SUPERVISOR',
  'TEACHER',
  'EXAM_COMMITTEE',
  'PARENT',
  'SUPPORT',
];

/** Pages an announcement can usefully point at. */
const LINK_OPTIONS = [
  { value: '', label: '— بدون رابط —' },
  { value: '/courses', label: 'الدورات التعليمية' },
  { value: '/circles', label: 'الحلقات' },
  { value: '/exams', label: 'الاختبارات' },
  { value: '/students', label: 'الطلاب' },
  { value: '/parent/children', label: 'متابعة الأبناء (لأولياء الأمور)' },
  { value: '/support', label: 'الدعم الفني' },
];

/**
 * Publishing side of the announcements bar. Administration only — everyone else
 * sees the result in the bar at the top of every page.
 */
export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['announcements', page],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Announcement>>('/announcements', {
          params: { page, limit: 15 },
        })
      ).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/announcements/${id}`)).data,
    onSuccess: () => {
      toast.success('تم حذف الإعلان');
      void qc.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (err) => toast.error(apiError(err, 'تعذر حذف الإعلان')),
  });

  const toggle = useMutation({
    mutationFn: async (a: Announcement) =>
      (
        await api.patch(`/announcements/${a.id}`, {
          isActive: !a.isActive,
        })
      ).data,
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['announcements'] }),
    onError: (err) =>
      toast.error(apiError(err, 'تعذر تحديث الإعلان')),
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="الإعلانات"
        subtitle="تظهر في شريط الإعلانات أعلى كل صفحة للفئات المستهدفة"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <IconPlus size={16} /> إعلان جديد
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message={apiError(error, 'تعذر تحميل الإعلانات')}
          onRetry={refetch}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconBell size={30} />}
          title="لا توجد إعلانات"
          message="انشر إعلاناً ليظهر لجميع المستخدمين أو لفئة محددة منهم."
        />
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-800">
                        {a.title}
                      </h3>

                      <Badge
                        className={
                          !a.isActive
                            ? 'bg-slate-200 text-slate-600'
                            : a.isExpired
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                        }
                      >
                        {!a.isActive
                          ? 'موقوف'
                          : a.isExpired
                            ? 'منتهي'
                            : 'معروض'}
                      </Badge>
                    </div>

                    {a.body && (
                      <p className="mt-1.5 text-sm text-slate-600">
                        {a.body}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400">الفئات:</span>

                      {a.audience.length === 0 ? (
                        <Badge className="bg-primary-100 text-primary-800">
                          الجميع
                        </Badge>
                      ) : (
                        a.audience.map((r) => (
                          <Badge key={r} className={ROLE_COLORS[r]}>
                            {ROLE_LABELS[r]}
                          </Badge>
                        ))
                      )}

                      {a.link && (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          {isExternalLink(a.link) && (
                            <Badge className="bg-sky-100 text-[10px] text-sky-800">
                              رابط خارجي
                            </Badge>
                          )}

                          <span
                            className="numeric max-w-[18rem] truncate"
                            dir="ltr"
                            title={a.link}
                          >
                            → {a.link}
                          </span>
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-xs text-slate-400">
                      نُشر {formatDateTime(a.publishedAt)}
                      {a.expiresAt
                        ? ` — ينتهي ${formatDateTime(a.expiresAt)}`
                        : ''}
                      {a.createdBy ? ` — ${a.createdBy.fullName}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle.mutate(a)}
                    >
                      {a.isActive ? 'إيقاف' : 'تفعيل'}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(a);
                        setFormOpen(true);
                      }}
                    >
                      تعديل
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={async () => {
                        const yes = await confirm({
                          title: 'حذف الإعلان',
                          message: `سيتم حذف "${a.title}" نهائياً.`,
                          confirmLabel: 'حذف',
                          variant: 'danger',
                        });

                        if (yes) remove.mutate(a.id);
                      }}
                    >
                      <IconTrash size={14} />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {data && (
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onChange={setPage}
            />
          )}
        </>
      )}

      <AnnouncementForm
        open={formOpen}
        announcement={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function AnnouncementForm({
  open,
  announcement,
  onClose,
}: {
  open: boolean;
  announcement: Announcement | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const empty = {
    title: '',
    body: '',
    link: '',
    audience: [] as Role[],
    expiresAt: '',
  };

  const [linkKind, setLinkKind] = useState<'internal' | 'external'>(
    isExternalLink(announcement?.link) ? 'external' : 'internal',
  );

  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  if (open && !ready) {
    setForm(
      announcement
        ? {
            title: announcement.title,
            body: announcement.body ?? '',
            link: announcement.link ?? '',
            audience: announcement.audience ?? [],
            expiresAt: announcement.expiresAt?.slice(0, 10) ?? '',
          }
        : empty,
    );

    setErrors({});

    setLinkKind(
      isExternalLink(announcement?.link) ? 'external' : 'internal',
    );

    setReady(true);
  }

  if (!open && ready) {
    setReady(false);
  }

  const unreachableFor =
    linkKind === 'internal'
      ? rolesWithoutAccess(form.link, form.audience)
      : [];

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      announcement
        ? (
            await api.patch(
              `/announcements/${announcement.id}`,
              payload,
            )
          ).data
        : (await api.post('/announcements', payload)).data,

    onSuccess: () => {
      toast.success(
        announcement ? 'تم تحديث الإعلان' : 'تم نشر الإعلان',
      );

      void qc.invalidateQueries({
        queryKey: ['announcements'],
      });

      onClose();
    },

    onError: (err) =>
      setErrors({
        form: apiError(err, 'تعذر حفظ الإعلان'),
      }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();

    setErrors({});

    if (!form.title.trim()) {
      setErrors({
        title: 'عنوان الإعلان مطلوب',
      });
      return;
    }

    const cleanLink = form.link.trim();

    /*
     * الرابط اختياري:
     * إذا كان فارغاً لا نرسله للـBackend نهائياً.
     */
    if (
      cleanLink &&
      linkKind === 'external' &&
      !isExternalLink(cleanLink)
    ) {
      setErrors({
        link: 'الرابط الخارجي يجب أن يبدأ بـ https:// أو http://',
      });
      return;
    }

    /*
     * نبني البيانات الأساسية.
     * link لن يتم إرساله إذا كان فارغاً.
     */
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      expiresAt: form.expiresAt || undefined,
    };

    /*
     * فقط إذا كتب المستخدم رابطاً فعلياً نرسله.
     */
    if (cleanLink) {
      payload.link = cleanLink;
    }

    mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={announcement ? 'تعديل الإعلان' : 'إعلان جديد'}
      size="lg"
    >
      <form
        onSubmit={submit}
        className="space-y-4"
        noValidate
      >
        {errors.form && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            {errors.form}
          </div>
        )}

        <Input
          label="العنوان"
          value={form.title}
          onChange={(e) => {
            setForm((f) => ({
              ...f,
              title: e.target.value,
            }));

            setErrors((x) => ({
              ...x,
              title: '',
            }));
          }}
          error={errors.title}
          placeholder="مثال: افتتاح دورة أحكام التجويد"
          required
        />

        <Textarea
          label="نص الإعلان"
          rows={5}
          value={form.body}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              body: e.target.value,
            }))
          }
          placeholder="اكتب كامل محتوى الإعلان هنا..."
        />

        {unreachableFor.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-6 text-amber-900">
            <IconAlert
              size={15}
              className="mt-1 shrink-0"
            />

            <span>
              الصفحة المختارة غير متاحة لـ
              <span className="font-bold">
                {' '}
                {unreachableFor
                  .map((r) => ROLE_LABELS[r])
                  .join('، ')}
              </span>
              .
              سيظهر لهم الإعلان بلا رابط بدل نقلهم إلى صفحة محجوبة —
              اختر صفحة أخرى، أو رابطاً خارجياً، أو احصر الفئات
              المستهدفة.
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex gap-1 rounded-xl bg-slate-100 p-1">
              {([
                ['internal', 'صفحة داخل النظام'],
                ['external', 'رابط خارجي'],
              ] as const).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    setLinkKind(kind);

                    setForm((f) => ({
                      ...f,
                      link: '',
                    }));

                    setErrors((x) => ({
                      ...x,
                      link: '',
                    }));
                  }}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    linkKind === kind
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {linkKind === 'internal' ? (
              <Select
                label="ينتقل إلى"
                value={form.link}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    link: e.target.value,
                  }))
                }
                hint="اختياري — يمكنك اختيار بدون رابط"
              >
                {LINK_OPTIONS.map((o) => {
                  const blocked = rolesWithoutAccess(
                    o.value,
                    form.audience,
                  );

                  return (
                    <option
                      key={o.value}
                      value={o.value}
                    >
                      {o.label}
                      {blocked.length
                        ? ` — لا تتاح لـ${blocked
                            .map((r) => ROLE_LABELS[r])
                            .join('، ')}`
                        : ''}
                    </option>
                  );
                })}
              </Select>
            ) : (
              <Input
                label="الرابط الخارجي (اختياري)"
                value={form.link}
                dir="ltr"
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    link: e.target.value,
                  }));

                  setErrors((x) => ({
                    ...x,
                    link: '',
                  }));
                }}
                error={errors.link}
                placeholder="https://example.org/news"
                hint="اتركه فارغاً إذا كان الإعلان لا يحتاج إلى رابط"
              />
            )}
          </div>

          <Input
            label="ينتهي بتاريخ"
            type="date"
            value={form.expiresAt}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                expiresAt: e.target.value,
              }))
            }
            hint="اتركه فارغاً ليبقى معروضاً"
          />
        </div>

        <div>
          <span className="label">
            الفئات المستهدفة
          </span>

          <p className="mb-2 text-xs text-slate-400">
            لا تحدد أي فئة ليظهر الإعلان لجميع المستخدمين.
          </p>

          <div className="flex flex-wrap gap-2">
            {AUDIENCE_ROLES.map((role) => {
              const active = form.audience.includes(role);

              return (
                <button
                  key={role}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      audience: active
                        ? f.audience.filter(
                            (r) => r !== role,
                          )
                        : [...f.audience, role],
                    }))
                  }
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {ROLE_LABELS[role]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            إلغاء
          </Button>

          <Button
            type="submit"
            loading={mutation.isPending}
          >
            {announcement ? 'حفظ' : 'نشر'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
