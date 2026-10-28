import { notifyWriteSuccess } from '@/lib/write-feedback';
import ThemeSelect from '@/components/ThemeSelect';
import LocalSecuritySettings from '@/components/LocalSecuritySettings';
import FirstUseOnboarding from '@/components/FirstUseOnboarding';
import { passwordError } from '@/lib/validation';
import { NativePushSettings } from '@/components/NativePush';
import { Link } from 'react-router-dom';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError, syncQueuedAvatar } from '@/lib/api';
import { queueAvatar, readPendingAvatar } from '@/lib/pending-avatar';
import { useAuthStore } from '@/store/auth';
import { Avatar, Badge, Button, Card, Input, Modal, PageHeader, Spinner, StatCard, Textarea } from '@/components/ui';
import { PHONE_HINT, emailError, phoneError } from '@/lib/validation';
import {
  IconSettings,
  IconCamera,
  IconCircleGroup,
  IconGraduation,
  IconLock,
  IconLogout,
  IconUser,
} from '@/components/ui/Icons';
import { EMPLOYMENT_LABELS, ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import { formatDate, formatDateTime, formatParts } from '@/lib/format';
import { rememberOfflineLogin } from '@/lib/offline-login';

export default function ProfilePage({ settings = false }: { settings?: boolean }) {
  const [replayIntro, setReplayIntro] = useState(false);
  const [nickname, setNickname] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const { user, logout, forgetDevice, setUser } = useAuthStore();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: profile } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      setUser(data);
      return data;
    },
  });

  useEffect(() => { if (profile) setNickname(profile.nickname || ''); }, [profile?.nickname]);

  const changePassword = useMutation({
    mutationFn: async () => {
      const result = await api.patch('/auth/change-password', { currentPassword, newPassword });
      if (user) await rememberOfflineLogin(user.username, newPassword, { ...user, mustChangePassword: false });
      return result;
    },
    onSuccess: async (_offlineWriteResult) => {
      notifyWriteSuccess(_offlineWriteResult, 'تم تغيير كلمة المرور، يرجى تسجيل الدخول مجدداً');
      await logout();
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  if (!user) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = 'كلمة المرور الحالية مطلوبة';
    if (passwordError(newPassword)) next.newPassword = passwordError(newPassword);
    if (newPassword !== confirmPassword) next.confirmPassword = 'كلمتا المرور غير متطابقتين';
    if (newPassword && newPassword === currentPassword) next.newPassword = 'يجب أن تختلف عن الحالية';
    setErrors(next);
    if (Object.keys(next).length) return;
    changePassword.mutate();
  };

  const teacher = profile?.teacherProfile;

  return (
    <>
      {replayIntro && <div className="fixed inset-0 z-[200] overflow-y-auto"><FirstUseOnboarding onComplete={() => setReplayIntro(false)} /></div>}
      <PageHeader title={settings ? "إعدادات الحساب" : "الملف الشخصي"} subtitle="رحلتك مع القرآن في مكان واحد" action={<Link className="app-icon-button" aria-label={settings ? "الملف الشخصي" : "إعدادات الحساب"} to={settings ? "/profile" : "/profile/settings"}><IconSettings size={21} /></Link>} />{!settings && <div className="profile-cover"><span>رحلة نور مع القرآن</span><p>كل آية تحفظها، أثر يبقى معك</p></div>}
      <Link to="/community/users/me" className="inline-flex rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white">👤 افتح ملفي الشخصي العام ومنشوراتي</Link>


      <div className="grid gap-5 lg:grid-cols-3">
        <Card className={settings ? "lg:col-span-1" : "profile-identity lg:col-span-1"}>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <AvatarUploader user={user} onUpdated={setUser} />
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">{user.fullName}</h2>
              <p className="numeric text-xs text-slate-400" dir="ltr">
                {user.username}
              </p>
              {profile?.email && (
                <p className="text-xs text-slate-400" dir="ltr">
                  {profile.email}
                </p>
              )}
            </div>
            <Badge className={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Badge>
          </div>

          <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-xs">
            <Row label="الجوال" value={<span className="numeric" dir="ltr">{profile?.phone}</span>} />
            <Row label="آخر دخول" value={formatDateTime(profile?.lastLoginAt)} />
            <Row
              label="حالة الحساب"
              value={
                <Badge className={user.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                  {user.isActive ? 'نشط' : 'موقوف'}
                </Badge>
              }
            />
          </dl>

          <Button
            variant="secondary"
            className="mt-5 w-full"
            icon={<IconLogout size={16} />}
            onClick={async () => {
              try { await logout(); navigate('/login', { replace: true }); }
              catch (error) { toast.error(apiError(error)); }
            }}
          >
            تسجيل الخروج
          </Button>
            <p className="mt-2 text-xs leading-6 text-slate-500">تبقى بياناتك مشفرة على الجهاز، ويمكنك الدخول بكلمة مرورك دون نت. التعديلات المعلقة تبقى محفوظة.</p>
            <Button variant="secondary" className="mt-3 w-full" onClick={async () => {
              if (!window.confirm('حذف بيانات هذا الحساب من هذا الجهاز وإلغاء الدخول دون نت؟ لا يمكن الحذف بوجود تعديلات غير مزامنة.')) return;
              try { await forgetDevice(); navigate('/login', { replace: true }); } catch (error) { toast.error(apiError(error)); }
            }}>حذف بيانات الحساب من هذا الجهاز</Button>
          <Link to="/account-deletion" className="mt-3 block py-3 text-center text-sm font-bold text-red-700">طلب حذف الحساب والبيانات</Link>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          {user.role === 'TEACHER' && teacher && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="الأجزاء المحفوظة" value={formatParts(teacher.memorizedParts)} icon={<IconGraduation size={22} />} />
                <StatCard
                  label="نوع التعاقد"
                  value={EMPLOYMENT_LABELS[teacher.employmentType as keyof typeof EMPLOYMENT_LABELS]}
                  icon={<IconUser size={22} />}
                  tone="sky"
                />
                <StatCard label="تاريخ التعيين" value={formatDate(teacher.hireDate)} icon={<IconCircleGroup size={22} />} tone="purple" />
              </div>
              <Card title="بياناتي الوظيفية">
                <dl className="grid gap-3 text-xs sm:grid-cols-2">
                  <Row label="المؤهل" value={teacher.qualification} />
                  <Row label="التخصص" value={teacher.specialization} />
                  <Row label="رقم الهوية" value={<span className="numeric" dir="ltr">{teacher.nationalId}</span>} />
                  <Row label="العنوان" value={teacher.address} />
                </dl>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => navigate(`/teachers/${teacher.id}`)}
                >
                  عرض ملفي الكامل
                </Button>
              </Card>
            </>
          )}

          {user.role === 'SUPERVISOR' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="الحلقات المشرف عليها" value={profile?.supervisedCircles ?? 0} icon={<IconCircleGroup size={22} />} />
            </div>
          )}

          {user.role === 'PARENT' && profile?.parentProfile && (
            <Card title="بياناتي">
              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <Row label="الجوال" value={<span className="numeric" dir="ltr">{profile.parentProfile.phone}</span>} />
                <Row label="جوال بديل" value={<span className="numeric" dir="ltr">{profile.parentProfile.altPhone}</span>} />
                <Row label="المهنة" value={profile.parentProfile.occupation} />
                <Row label="العنوان" value={profile.parentProfile.address} />
              </dl>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/parent/children')}>
                متابعة الأبناء
              </Button>
            </Card>
          )}

          {['STUDENT', 'TEACHER'].includes(user.role) ? <Card title="بياناتي الشخصية"><Button onClick={() => navigate('/verify-profile')}>تحقق من بياناتي</Button></Card> : <ProfileDetailsCard profile={profile} onUpdated={setUser} />}

          {settings && <>
          <LocalSecuritySettings />
          <Card title="دليل التطبيق"><p className="mb-3 text-sm text-slate-500">تعرّف على الحلقات والمتابعة والتواصل.</p><Button variant="secondary" onClick={() => setReplayIntro(true)}>إعادة مشاهدة شرح التطبيق</Button></Card>
          <Card title="المظهر"><div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><span className="text-sm text-slate-500">اختر مظهر التطبيق</span><ThemeSelect /></div></Card>
          <Card title="الكنية"><form className="flex gap-2" onSubmit={async e => { e.preventDefault(); setSavingNickname(true); try { const result = await api.patch('/community/nickname', { nickname: nickname.trim() }); if(result.data?.synced===0) toast('حُفظت الكنية محليًا، بانتظار المزامنة'); else toast.success('تم حفظ الكنية'); } catch (error) { toast.error(apiError(error)); } finally { setSavingNickname(false); } }}><Input aria-label="الكنية" placeholder={profile?.nickname || 'أضف كنيتك'} maxLength={60} value={nickname} onChange={e => setNickname(e.target.value)} /><Button type="submit" loading={savingNickname}>حفظ</Button></form></Card>
          <NativePushSettings />
          <Card title="الإعدادات — الإشعارات"><Link className="btn-secondary inline-flex" to="/profile/settings/notifications/sound">صوت الإشعارات</Link><Link className="mt-3 block text-sm underline" to="/prayer-times/reminders">إعدادات تذكيرات الصلاة</Link></Card>
          <Card title="تغيير كلمة المرور" subtitle="سيتم إنهاء جميع جلساتك بعد التغيير">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Input
                label="كلمة المرور الحالية"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={errors.currentPassword}
                className="sm:col-span-2"
                dir="ltr"
              />
              <Input
                label="كلمة المرور الجديدة"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={errors.newPassword}
                hint="أي طول تختاره"
                dir="ltr"
              />
              <Input
                label="تأكيد كلمة المرور"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
                dir="ltr"
              />
              <div className="sm:col-span-2">
                <Button type="submit" loading={changePassword.isPending} icon={<IconLock size={16} />}>
                  تغيير كلمة المرور
                </Button>
              </div>
            </form>
          </Card>
          </>}
          {!settings && <Card title="منشوراتي"><Link className="btn-primary inline-flex" to="/community/users/me">عرض ملفي ومنشوراتي</Link></Card>}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="text-left font-semibold text-slate-700">{value || '—'}</dd>
    </div>
  );
}

/**
 * Profile picture. The file goes to Cloudinary when the school has configured
 * it, and to local storage otherwise — the page does not need to know which.
 */
function AvatarUploader({
  user,
  onUpdated,
}: {
  user: { fullName: string; avatarUrl?: string | null };
  onUpdated: (user: any) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const account = useAuthStore(state => state.user?.id);
  const [pendingPreview, setPendingPreview] = useState<string>();
  useEffect(() => {
    let active = true;
    let preview: string | undefined;
    let generation = 0;
    const refresh = async () => {
      const version = ++generation;
      const pending = account ? await readPendingAvatar(account) : undefined;
      if (!active || version !== generation) return;
      if (preview) URL.revokeObjectURL(preview);
      preview = pending ? URL.createObjectURL(pending.blob) : undefined;
      setPendingPreview(preview);
    };
    const changed = () => { void refresh().catch(() => undefined); };
    changed();
    window.addEventListener('halaqat:changed', changed);
    return () => { active = false; if (preview) URL.revokeObjectURL(preview); window.removeEventListener('halaqat:changed', changed); };
  }, [account]);
  const [cropUrl,setCropUrl]=useState<string|null>(null);
  const [zoom,setZoom]=useState(1);
  const [position,setPosition]=useState({x:0,y:0});
  const [dimensions,setDimensions]=useState({w:1,h:1});
  const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
  useEffect(()=>()=>{if(cropUrl)URL.revokeObjectURL(cropUrl);},[cropUrl]);
  const size=280, base=Math.max(size/dimensions.w,size/dimensions.h);
  const w=dimensions.w*base*zoom,h=dimensions.h*base*zoom;
  const clamp=(x:number,y:number,z=zoom)=>({x:Math.max(-(dimensions.w*base*z-size)/2,Math.min((dimensions.w*base*z-size)/2,x)),y:Math.max(-(dimensions.h*base*z-size)/2,Math.min((dimensions.h*base*z-size)/2,y))});
  const saveCrop=async()=>{
    if(!cropUrl)return;
    setUploading(true);
    try{
      const image=new Image();image.src=cropUrl;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
      ctx.drawImage(image,(size/2-w/2+position.x)*512/size,(size/2-h/2+position.y)*512/size,w*512/size,h*512/size);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Crop failed')),'image/jpeg',0.9));
      if (!account) throw new Error('يلزم تسجيل الدخول');
      await queueAvatar(account, blob);
      setCropUrl(null);
      toast('حُفظت الصورة على الجهاز، بانتظار تأكيد الخادم');
      try {
        await syncQueuedAvatar();
        if (!(await readPendingAvatar(account)) && useAuthStore.getState().user?.id === account) {
          const fresh=await api.get('/auth/me');onUpdated(fresh.data);toast.success('تم تحديث الصورة الشخصية');
        }
      } catch { toast('الصورة محفوظة؛ ستُعاد محاولة رفعها عند الاتصال'); }
    }catch(error){toast.error(apiError(error,'تعذر رفع الصورة'));}finally{setUploading(false);}
  };

  const pick=(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(!file.type.startsWith('image/')){toast.error('اختر صورة صالحة');return;}
    setZoom(1);setPosition({x:0,y:0});setDimensions({w:1,h:1});setCropUrl(URL.createObjectURL(file));
  };

  const remove = async () => {
    setUploading(true);
    try {
      await api.patch('/auth/profile', { avatarUrl: '' });
      const fresh = await api.get('/auth/me');
      onUpdated(fresh.data);
      toast.success('تمت إزالة الصورة');
    } catch (error) {
      toast.error(apiError(error, 'تعذر إزالة الصورة'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Two separate targets: the picture itself opens full-screen, the badge
          on its corner replaces it. One button doing both meant you could never
          simply look at your own photo. */}
      <div className="relative">
        <Avatar name={user.fullName} src={pendingPreview || user.avatarUrl} size={88} preview />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !!pendingPreview}
          className="absolute -bottom-0.5 -left-0.5 grid h-8 w-8 place-items-center rounded-full bg-primary-600 text-white shadow-md ring-2 ring-white transition hover:bg-primary-700 disabled:opacity-60"
          title="تغيير الصورة الشخصية"
          aria-label="تغيير الصورة الشخصية"
        >
          {uploading ? <Spinner size={15} /> : <IconCamera size={16} />}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={pick}
        className="hidden"
      />

      {pendingPreview && <div className="text-center text-xs text-amber-700" role="status">الصورة بانتظار المزامنة <button type="button" disabled={uploading} className="underline" onClick={async () => { setUploading(true); try { await syncQueuedAvatar(); if (account && !(await readPendingAvatar(account)) && useAuthStore.getState().user?.id === account) { const fresh = await api.get('/auth/me'); onUpdated(fresh.data); toast.success('تم تحديث الصورة الشخصية'); } } catch (error) { toast.error(apiError(error, 'الصورة محفوظة، تعذر رفعها الآن')); } finally { setUploading(false); } }}>إعادة المحاولة</button></div>}
      {user.avatarUrl && !pendingPreview && (
        <button
          type="button"
          onClick={remove}
          disabled={uploading}
          className="text-[11px] font-semibold text-slate-400 transition hover:text-red-600"
        >
          إزالة الصورة
        </button>
      )}
      {cropUrl&&<Modal open onClose={()=>setCropUrl(null)} title="تحديد الصورة الشخصية">
        <div className="space-y-4">
          <p className="text-sm">حرّك الصورة بإصبعك أو الماوس لتحديد الجزء الظاهر داخل الدائرة.</p>
          <div className="relative mx-auto overflow-hidden rounded-full border-4 border-primary-500 bg-slate-100 touch-none" style={{width:size,height:size}}
            onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,px:position.x,py:position.y};}}
            onPointerMove={e=>{if(drag.current)setPosition(clamp(drag.current.px+e.clientX-drag.current.x,drag.current.py+e.clientY-drag.current.y));}}
            onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
            <img src={cropUrl} alt="معاينة قص الصورة" draggable={false} onLoad={e=>{setDimensions({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight});setPosition({x:0,y:0});}}
              className="absolute max-w-none select-none pointer-events-none" style={{width:w,height:h,left:size/2-w/2+position.x,top:size/2-h/2+position.y}}/>
          </div>
          <label className="block text-sm">تكبير الصورة: {zoom.toFixed(1)}×<input className="w-full" type="range" min="1" max="3" step="0.05" value={zoom} onChange={e=>{const z=Number(e.target.value);setPosition(clamp(position.x,position.y,z));setZoom(z);}}/></label>
          <div className="flex gap-2"><Button loading={uploading} onClick={()=>void saveCrop()}>حفظ الصورة</Button><Button variant="secondary" disabled={uploading} onClick={()=>setCropUrl(null)}>إلغاء</Button></div>
        </div>
      </Modal>}
    </div>
  );
}

/** Name, contact details and job title — the parts a user may edit themselves. */
function ProfileDetailsCard({
  profile,
  onUpdated,
}: {
  profile: any;
  onUpdated: (user: any) => void;
}) {
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? '',
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  // Seed once the profile arrives.
  if (profile && !ready) {
    setForm({
      fullName: profile.fullName ?? '',
      email: profile.email ?? '',
      phone: profile.phone ?? '',
    });
    setReady(true);
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.patch('/auth/profile', {
        fullName: form.fullName,
        email: form.email || '',
        phone: form.phone || '',
      }),
    onSuccess: async (_offlineWriteResult) => {
      notifyWriteSuccess(_offlineWriteResult, 'تم تحديث بياناتك');
      const fresh = await api.get('/auth/me');
      onUpdated(fresh.data);
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = 'الاسم مطلوب';
    const mailErr = emailError(form.email);
    if (mailErr) next.email = mailErr;
    const phoneErr = phoneError(form.phone);
    if (phoneErr) next.phone = phoneErr;
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate();
  };

  return (
    <Card title="بياناتي الشخصية" subtitle="اسم الدخول لا يمكن تغييره إلا من قِبل الإدارة">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input
          label="الاسم الكامل"
          required
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          error={errors.fullName}
          className="sm:col-span-2"
        />
        <Input
          label="الجوال"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          error={errors.phone}
          hint={PHONE_HINT}
          dir="ltr"
        />
        <Input
          label="البريد الإلكتروني"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
          hint="اختياري — للتواصل فقط"
          dir="ltr"
        />
        <div className="sm:col-span-2">
          <Button type="submit" loading={mutation.isPending}>
            حفظ البيانات
          </Button>
        </div>
      </form>
    </Card>
  );
}
