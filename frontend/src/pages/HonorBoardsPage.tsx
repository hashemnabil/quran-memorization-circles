import { useHonorBoards } from '@/components/HonorBoardPreview';
import { PageHeader } from '@/components/ui';

export default function HonorBoardsPage() {
  const { data: boards, isLoading, isError } = useHonorBoards();
  return <div dir="rtl">
    <PageHeader title="لوحات الشرف" subtitle="تكريم طلاب مدرسة عبدالله بن عمر لتعليم القرآن الكريم" />
    {isLoading && <p role="status">جارٍ تحميل لوحات الشرف…</p>}
    {isError && <p role="alert">تعذر تحميل اللوحات. حاول مجددًا عند توفر الاتصال.</p>}
    {!isLoading && !isError && !boards?.length && <p>لا توجد لوحات شرف منشورة حاليًا.</p>}
    <div className="grid gap-4">
      {boards?.map(board => <section key={board.id} className="card p-4 sm:p-5">
        <h2 className="mb-3 text-lg font-extrabold">{board.title}</h2>
        <div className="divide-y divide-slate-200">
          {board.students.map((student, index) => <div key={index} className="grid gap-1 py-2 text-sm sm:grid-cols-[2fr_1fr_1fr] sm:gap-3">
            <strong>{student.name}</strong><span>{student.circle}</span><span className="text-primary-700">{student.description}</span>
          </div>)}
        </div>
      </section>)}
    </div>
  </div>;
}
