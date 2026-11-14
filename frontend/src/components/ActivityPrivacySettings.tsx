import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Card } from '@/components/ui';

export default function ActivityPrivacySettings() {
  const queryClient = useQueryClient();
  const preference = useQuery({queryKey: ['activity', 'privacy'], queryFn: async () => (await api.get<{hidden: boolean}>('/activity/privacy')).data});
  const change = useMutation({
    mutationFn: async (hidden: boolean) => (await api.patch('/activity/privacy', {hidden})).data,
    onSuccess: data => {
      queryClient.setQueryData(['activity', 'privacy'], data);
      void queryClient.invalidateQueries({queryKey: ['chat']});
      getSocket()?.emit('activity:privacy-changed');
      toast.success('تم حفظ خصوصية النشاط');
    },
    onError: error => toast.error(apiError(error, 'تعذر حفظ الخصوصية. تحقق من الاتصال.')),
  });
  return <Card title="الخصوصية والأمان" subtitle="تحكّم بمن يمكنه معرفة نشاطك">
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span><strong className="block text-sm">إخفاء حالة النشاط وآخر ظهور</strong><small className="text-slate-500">يُطبّق الإخفاء على الخادم في المحادثات.</small></span>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-emerald-700" checked={preference.data?.hidden ?? true} disabled={!preference.data || change.isPending} onChange={event => change.mutate(event.target.checked)}/>
    </label>
    {preference.isError && <p role="alert" className="mt-3 text-sm text-red-600">تعذر تحميل إعداد الخصوصية. <button type="button" className="underline" onClick={()=>void preference.refetch()}>إعادة المحاولة</button></p>}
    {change.isPending && <p role="status" className="mt-3 text-sm">جارٍ حفظ الإعداد…</p>}
  </Card>;
}
