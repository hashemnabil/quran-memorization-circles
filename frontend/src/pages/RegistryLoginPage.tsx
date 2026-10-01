import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registryApi, registryToken, apiError } from '@/lib/registryApi';

export default function RegistryLoginPage() {
  const [nationalId, setNationalId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const id = nationalId.trim();
    if (!/^\\d{3,30}$/.test(id)) { setError('أدخل رقم هوية صحيحاً.'); return; }
    setLoading(true);
    try {
      const { data } = await registryApi.post('/registry/access', { nationalId: id });
      registryToken.set(data.accessToken);
      navigate('/register/data', { replace: true });
    } catch (err) {
      setError(apiError(err, 'رقم الهوية غير موجود في النظام.'));
    } finally { setLoading(false); }
  }

  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
    <div className="mx-auto flex min-h-[80vh] max-w-md items-center">
      <section className="w-full rounded-3xl border border-slate-100 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-9">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-700 text-xl font-black text-white">ه</div>
          <h1 className="text-2xl font-black">تسجيل البيانات</h1>
          <p className="mt-2 text-sm text-slate-500">يرجى إدخال رقم الهوية للوصول إلى بياناتك</p>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-bold">رقم الهوية</span>
            <input autoFocus inputMode="numeric" dir="ltr" value={nationalId} onChange={e=>setNationalId(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-center text-lg tracking-widest outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-100" placeholder="123456789" />
          </label>
          {error && <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
          <button disabled={loading} className="w-full rounded-2xl bg-primary-700 px-5 py-3.5 font-bold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? 'جارٍ التحقق...' : 'دخول'}
          </button>
        </form>
      </section>
    </div>
  </main>;
}
