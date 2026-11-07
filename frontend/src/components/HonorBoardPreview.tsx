import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

export type HonorBoard = {
  id: string;
  title: string;
  students: { name: string; circle: string; description: string }[];
};

export function useHonorBoards() {
  return useQuery({
    queryKey: ['honor-boards', 'published'],
    queryFn: async () => {
      const response = await api.get<HonorBoard[]>('/honor-boards');
      return response.data;
    },
    retry: false,
    staleTime: 60_000,
  });
}

/** Compact home preview. Hidden until the server has published boards. */
export default function HonorBoardPreview() {
  const { data: boards } = useHonorBoards();
  const latest = boards?.[0];
  if (!latest) return null;
  return <section className="card mb-6 p-4 sm:p-5" aria-label="لوحات الشرف" dir="rtl">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-xs font-bold text-primary-700">🏆 لوحات الشرف</p>
        <h2 className="mt-1 text-lg font-extrabold">{latest.title}</h2>
      </div>
      <Link to="/honor-boards" className="text-sm font-bold text-primary-700 underline">عرض جميع اللوحات</Link>
    </div>
    <div className="divide-y divide-slate-200">
      {latest.students.slice(0, 5).map((student, index) => <div key={index} className="grid grid-cols-1 gap-1 py-2 text-sm sm:grid-cols-[2fr_1fr_1fr] sm:gap-3">
        <strong>{student.name}</strong><span>{student.circle}</span><span className="text-primary-700">{student.description}</span>
      </div>)}
    </div>
  </section>;
}
