import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { IconAlert, IconLock } from '@/components/ui/Icons';

export function ForbiddenPage() {
  return (
    <Card className="mx-auto max-w-lg">
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-500">
          <IconLock size={30} />
        </span>
        <h1 className="text-xl font-extrabold text-slate-800">لا تملك صلاحية الوصول</h1>
        <p className="max-w-sm text-sm leading-7 text-slate-500">
          هذه الصفحة غير متاحة لدورك في النظام. إذا كنت تعتقد أن هذا خطأ يرجى مراجعة الإدارة أو الدعم الفني.
        </p>
        <Link to="/">
          <Button variant="secondary">العودة إلى لوحة المعلومات</Button>
        </Link>
      </div>
    </Card>
  );
}

export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-lg">
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 text-amber-500">
          <IconAlert size={30} />
        </span>
        <h1 className="text-xl font-extrabold text-slate-800">الصفحة غير موجودة</h1>
        <p className="text-sm text-slate-500">تعذر العثور على الصفحة المطلوبة.</p>
        <Link to="/">
          <Button variant="secondary">العودة إلى لوحة المعلومات</Button>
        </Link>
      </div>
    </Card>
  );
}
