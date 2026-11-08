import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Select } from '@/components/ui';
export function RankingFilters({ period, circleId, onChange }: {
    period: string;
    circleId: string;
    onChange: (period: string, circleId: string) => void;
}) { const circles = useQuery({ queryKey: ['circles', 'options'], queryFn: async () => (await api.get<{
        id: string;
        name: string;
    }[]>('/circles/options')).data }); return <div className="mb-4 grid grid-cols-2 gap-3"><Select label="الفترة" value={period} onChange={e => onChange(e.target.value, circleId)}><option value="all">كل الأوقات</option><option value="week">هذا الأسبوع</option><option value="month">هذا الشهر</option></Select><Select label="الحلقة" value={circleId} onChange={e => onChange(period, e.target.value)}><option value="">كل الحلقات</option>{circles.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>; }
