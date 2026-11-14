import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Modal, Textarea } from '@/components/ui';

export default function PendingRequestReasonEditor({ domain, id, reason }: { domain: 'transfers' | 'suspensions'; id: string; reason?: string | null }) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(''), [original, setOriginal] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const save = useMutation({ mutationFn: async () => (await api.patch(`/${domain}/${id}`, { reason: draft, previousReason: original })).data,
    onSuccess: data => { if (data?.synced === 0) toast('حُفظ تعديل السبب على الجهاز، بانتظار تأكيد الخادم'); else toast.success('تم تعديل سبب الطلب'); setOpen(false); void queryClient.invalidateQueries({ queryKey: [domain] }); },
    onError: error => toast.error(apiError(error)),
  });
  return <><Button size="sm" variant="secondary" onClick={() => { setOriginal(reason ?? null); setDraft(reason || ''); setOpen(true); }}>تعديل السبب</Button>
    {open && <Modal open onClose={() => { if (!save.isPending) setOpen(false); }} title="تعديل سبب الطلب المعلق">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
        <p className="text-sm text-slate-500">تعديل السبب لا يعتمد الطلب ولا يغير قرار الإدارة. يُتحقق من أحدث نسخة عند المزامنة.</p>
        <Textarea label="سبب الطلب" maxLength={1000} value={draft} onChange={event => setDraft(event.target.value)} required />
        <Button type="submit" loading={save.isPending} disabled={!draft.trim()}>حفظ التعديل</Button>
      </form>
    </Modal>}
  </>;
}
