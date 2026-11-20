import { Link } from 'react-router-dom';
import { useLiveData } from '@/hooks/useLiveData';
import { useAuthStore } from '@/store/auth';

export default function DutyReminder() {
  const user = useAuthStore((state) => state.user);
  const duties = useLiveData('teacherDuties');
  if (user?.role !== 'TEACHER') return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  const due = duties.filter((duty) => [today, tomorrow].includes(String(duty.date).slice(0, 10)) && duty.assignments?.some((entry: any) => entry.teacherUserId === user.id));
  return due.length ? <aside role="status" dir="rtl" className="my-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950"><Link to="/teacher-duties">تذكير النظام: {due.map((duty) => `${String(duty.date).slice(0, 10) === today ? 'اليوم' : 'غدًا'} (${duty.day})`).join('، ')} — عرض جدولك</Link></aside> : null;
}
