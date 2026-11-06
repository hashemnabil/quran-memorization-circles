import { useState, type ComponentType } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import ProfilePage from './ProfilePage';
import ThemeSelect, { ThemeSwitch } from '@/components/ThemeSelect';
import LocalSecuritySettings from '@/components/LocalSecuritySettings';
import ActivityPrivacySettings from '@/components/ActivityPrivacySettings';
import CommunityPreferences from '@/components/CommunityPreferences';
import { NativePushSettings } from '@/components/NativePush';
import FirstUseOnboarding from '@/components/FirstUseOnboarding';
import AppVersion from '@/components/AppVersion';
import { Button, Card, useConfirm } from '@/components/ui';
import { IconUser, IconLock, IconEye, IconSettings, IconMoon, IconBell, IconClock, IconLifeBuoy, IconInfo, IconTrash, IconLogout, IconBook, IconChevronLeft, IconSearch, IconDownload } from '@/components/ui/Icons';
import { useAuthStore } from '@/store/auth';
import { apiError } from '@/lib/api';
import '@/styles/settings-mobile.css';

type Row = {title: string; icon: ComponentType<{size?: number}>; to?: string; action?: 'logout'|'forget'|'guide'; danger?: boolean; hint?: string};
const groups: {title:string; rows:Row[]}[] = [
  {title:'الحساب', rows:[
    {title:'الملف الشخصي',icon:IconUser,to:'/profile'},
    {title:'الكنية والنبذة',icon:IconBook,to:'?section=identity'},
    {title:'كلمة المرور',icon:IconLock,to:'?section=password'},
    {title:'رمز الأمان',icon:IconLock,to:'?section=pin'},
    {title:'الخصوصية وحالة النشاط',icon:IconEye,to:'?section=privacy'},
  ]},
  {title:'التخصيص',rows:[{title:'المظهر',icon:IconSettings,to:'?section=appearance',hint:'نهاري، ليلي، حسب الجهاز'}]},
  {title:'الإشعارات والأذان',rows:[
    {title:'تحديد الإشعارات',icon:IconBell,to:'?section=notifications'},
    {title:'صوت الإشعارات',icon:IconBell,to:'/profile/settings/notifications/sound'},
    {title:'صوت الأذان وتذكير الصلاة',icon:IconClock,to:'/prayer-times/reminders'},
  ]},
  {title:'التطبيق والمساعدة',rows:[
    {title:'المساعدة والدعم',icon:IconLifeBuoy,to:'/support'},
    {title:'الأذونات',icon:IconLock,to:'?section=permissions'},
    {title:'البيانات والمزامنة',icon:IconDownload,to:'/settings/offline'},
    {title:'دليل التطبيق',icon:IconBook,action:'guide'},
    {title:'حول التطبيق',icon:IconInfo,to:'?section=about'},
    {title:'سياسة الخصوصية',icon:IconEye,to:'/privacy'},
  ]},
  {title:'إدارة الحساب',rows:[
    {title:'حذف بيانات الحساب من هذا الجهاز',icon:IconTrash,action:'forget',danger:true},
    {title:'طلب حذف الحساب والبيانات',icon:IconTrash,to:'/account-deletion',danger:true},
    {title:'تسجيل الخروج',icon:IconLogout,action:'logout',danger:true},
  ]},
];
const titles:Record<string,string>={identity:'الكنية والنبذة',password:'كلمة المرور',pin:'رمز الأمان',privacy:'الخصوصية وحالة النشاط',appearance:'المظهر',notifications:'تحديد الإشعارات',permissions:'الأذونات',about:'حول التطبيق'};

export default function MobileSettingsPage() {
  const user=useAuthStore(state=>state.user)!;
  const [params]=useSearchParams(); const section=params.get('section')||'';
  const [search,setSearch]=useState(''),[guide,setGuide]=useState(false),[busy,setBusy]=useState(false);
  const confirm=useConfirm(),navigate=useNavigate();
  const action=async(kind:Row['action'])=>{
    if(kind==='guide'){setGuide(true);return;}
    if(kind==='forget'&&!await confirm({title:'حذف بيانات الجهاز',message:'هل تريد إزالة بيانات هذا الحساب من الجهاز؟ تُحفظ التعديلات المعلقة حتى تتم مزامنتها أو مسح مسوداتها.',variant:'danger'}))return;
    setBusy(true);
    try {if(kind==='forget')await useAuthStore.getState().forgetDevice();else await useAuthStore.getState().logout();navigate('/login',{replace:true});}
    catch(error){toast.error(apiError(error));}finally{setBusy(false);}
  };
  if(section==='identity'||section==='password')return <ProfilePage key={section} settings settingsSection={section}/>;
  const filtered=groups.map(group=>({...group,rows:group.rows.filter(row=>(row.title+' '+(row.hint||'')).includes(search.trim()))})).filter(group=>group.rows.length);
  return <div className="mobile-settings" dir="rtl">
    {guide&&<div className="fixed inset-0 z-[200] overflow-y-auto"><FirstUseOnboarding onComplete={()=>setGuide(false)}/></div>}
    <header className="settings-heading"><Link to={section?'/profile/settings':'/profile'} aria-label={section?'العودة للإعدادات':'العودة للملف الشخصي'} className="settings-back"><IconChevronLeft size={22}/></Link><h1>{titles[section]||'الإعدادات'}</h1></header>
    {section&&titles[section]?<div className="settings-detail-content">
      {section==='pin'&&<LocalSecuritySettings/>}
      {section==='privacy'&&<ActivityPrivacySettings/>}
      {section==='appearance'&&<Card title="اختر مظهر التطبيق"><ThemeSelect/></Card>}
      {section==='notifications'&&<><CommunityPreferences section="notifications"/><NativePushSettings/></>}
      {section==='permissions'&&<><NativePushSettings/><Card title="أذونات الصلاة والأذان"><p className="mb-4 text-sm leading-7">راجع أذونات التنبيهات والتذكيرات في إعدادات الصلاة. تختلف الخيارات حسب جهازك.</p><Link className="btn-secondary inline-flex" to="/prayer-times/reminders">إعدادات الأذان والأذونات</Link></Card></>}
      {section==='about'&&<Card title="حول التطبيق"><AppVersion/><Link to="/about" className="btn-secondary mt-4 inline-flex">دليل البرنامج والمدرسة</Link><Link to="/privacy" className="mt-4 block underline">سياسة الخصوصية</Link></Card>}
    </div>:<>
      <label className="settings-search"><IconSearch size={19}/><input aria-label="البحث في الإعدادات" value={search} onChange={event=>setSearch(event.target.value)} placeholder="البحث في الإعدادات" type="search"/></label>
      {filtered.map(group=><section className="settings-section" key={group.title} aria-label={group.title}><h2>{group.title}</h2><div className="settings-group">
        {group.title==='التخصيص'&&!search&&<div className="settings-row"><span className="settings-row-icon"><IconMoon size={20}/></span><span className="settings-row-label">الوضع الليلي</span><ThemeSwitch/></div>}
        {group.rows.map(row=>{const Icon=row.icon;const contents=<><span className="settings-row-icon"><Icon size={20}/></span><span className="settings-row-label">{row.title}{(row.hint||row.title==='الملف الشخصي')&&<small>{row.title==='الملف الشخصي'?user.fullName:row.hint}</small>}</span><IconChevronLeft size={17}/></>;return row.to?<Link className={'settings-row'+(row.danger?' settings-row-danger':'')} key={row.title} to={row.to}>{contents}</Link>:<button disabled={busy} className={'settings-row'+(row.danger?' settings-row-danger':'')} type="button" key={row.title} onClick={()=>void action(row.action)}>{contents}</button>;})}
      </div></section>)}
      {!filtered.length&&<p className="settings-empty" role="status">لا توجد إعدادات مطابقة لبحثك.</p>}
      <footer className="settings-version"><AppVersion/></footer>
    </>}
  </div>;
}
