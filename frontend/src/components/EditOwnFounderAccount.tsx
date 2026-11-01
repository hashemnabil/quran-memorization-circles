import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { rememberOfflineLogin, forgetOfflineLogin } from '@/lib/offline-login';
import { Button, Input, Modal } from './ui';

export default function EditOwnFounderAccount() {
  const user = useAuthStore(state => state.user)!;
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [username, setUsername] = useState(''), [fullName, setFullName] = useState(''), [password, setPassword] = useState('');
  const queries = useQueryClient();
  return <><Button variant="secondary" onClick={() => { setUsername(user.username); setFullName(user.fullName); setPassword(''); setMessage(''); setOpen(true); }}>تعديل حسابي كمؤسس</Button>
    <Modal open={open} onClose={() => { if (!busy) { setOpen(false); setPassword(''); } }} title="تعديل بيانات حساب المؤسس">
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault(); if (!navigator.onLine) { setMessage('تعديل حساب المؤسس يحتاج اتصالاً بالخادم'); return; }
        setBusy(true); setMessage('');
        try {
          const { data } = await api.patch('/founder/accounts/me', { username, fullName, currentPassword: password });
          if (useAuthStore.getState().user?.id !== user.id) return;
          const updated = { ...user, ...data }; useAuthStore.getState().setUser(updated);
          try {
            if (updated.username !== user.username) { await useAuthStore.getState().login(updated.username, password); forgetOfflineLogin(user.username); }
            else await rememberOfflineLogin(updated.username, password, updated);
            setPassword(''); setOpen(false);
          }
          catch { setMessage('حُفظ التعديل على الخادم؛ تعذر تحديث الدخول المحلي. سجّل الدخول بالاسم الجديد عند الاتصال.'); }
          await queries.invalidateQueries({ queryKey: ['users'] });
          await queries.invalidateQueries({ queryKey: ['auth', 'me'] });
        } catch (error) { setMessage(apiError(error)); }
        finally { setBusy(false); }
      }}>
        <p className="text-sm leading-7 text-slate-500">تعديل حسابك فقط، مع بقاء دور المؤسس. بعد تغيير اسم المستخدم استخدم الاسم الجديد للدخول.</p>
        <Input label="اسم مستخدمي الجديد" value={username} minLength={3} maxLength={32} onChange={event => setUsername(event.target.value)} />
        <Input label="اسمي في حساب المؤسس" value={fullName} maxLength={120} onChange={event => setFullName(event.target.value)} />
        <Input label="كلمة مروري لتأكيد تعديل حسابي" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
        {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
        <Button type="submit" loading={busy} disabled={!username.trim() || !fullName.trim() || !password}>حفظ بيانات حسابي</Button>
      </form>
    </Modal>
  </>;
}
