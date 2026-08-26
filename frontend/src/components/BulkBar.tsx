import { Button, Card } from '@/components/ui';
import { IconCheck, IconTrash, IconX } from '@/components/ui/Icons';

/**
 * The bar that appears above a list once bulk selection is switched on.
 *
 * It carries "select all", the running count and the delete action, so the rows
 * themselves only ever gain a checkbox — never a second set of controls.
 */
export function BulkBar({
  count,
  noun,
  allSelected,
  onToggleAll,
  onCancel,
  onDelete,
  deleting,
}: {
  count: number;
  /** Counted noun, e.g. "مستخدم" — shown as "تم تحديد 3 مستخدم". */
  noun: string;
  allSelected: boolean;
  onToggleAll: () => void;
  onCancel: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <Card className="mb-4 border-primary-200 bg-primary-50/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-primary-900">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
            />
            تحديد الكل
          </label>
          <span className="text-sm text-slate-500">
            {count > 0 ? (
              <>
                تم تحديد <span className="numeric font-bold text-primary-800">{count}</span> {noun}
              </>
            ) : (
              'لم يتم تحديد أي عنصر بعد'
            )}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<IconX size={15} />} onClick={onCancel}>
            إنهاء التحديد
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={count ? <IconTrash size={15} /> : <IconCheck size={15} />}
            disabled={count === 0}
            loading={deleting}
            onClick={onDelete}
          >
            حذف المحدد
          </Button>
        </div>
      </div>
    </Card>
  );
}
