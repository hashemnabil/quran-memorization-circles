import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registryApi, registryToken, apiError } from '@/lib/registryApi';

type User = { nationalId:string; fullName:string|null; phone:string|null; email:string|null; dateOfBirth:string|null; gender:'MALE'|'FEMALE'|null; city:string|null; address:string|null; notes:string|null; completed:boolean; updatedAt:string };
const empty: User = { nationalId:'', fullName:null, phone:null, email:null, dateOfBirth:null, gender:null, city:null, address:null, notes:null, completed:false, updatedAt:'' };

export default function RegistryDataPage() {
  const [form,setForm]=useState(empty); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const navigate=useNavigate();
  useEffect(()=>{ (async()=>{ const token=registryToken.get(); if(!token){navigate('/register',{replace:true});return;} try{const {data}=await registryApi.get<User>('/registry/me');setForm(data);}catch(e){registryToken.clear();setError(apiError(e,'انتهت جلسة الدخول.'));}finally{setLoading(false)}})()},[navigate]);
  const set=(key:keyof User,value:string)=>setForm(f=>({...f,[key]:value}));
  async function save(e:FormEvent){e.preventDefault();setMessage('');setError('');setSaving(true);try{const {data}=await registryApi.patch<User>('/registry/me',{fullName:form.fullName,phone:form.phone,email:form.email,dateOfBirth:form.dateOfBirth||undefined,gender:form.gender||undefined,city:form.city,address:form.address,notes:form.notes});setForm(data);setMessage('تم حفظ البيانات بنجاح.')}catch(e){setError(apiError(e))}finally{setSaving(false)}}
  if(loading)return <main dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">جارٍ تحميل بياناتك...</main>;
  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800"><div className="mx-auto max-w-2xl">
    <header className="mb-6"><p className="text-sm font-bold text-primary-700">تسجيل البيانات</p><h1 className="mt-1 text-2xl font-black">البيانات الشخصية</h1></header>
    <form onSubmit={save} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-xl shadow-slate-200/40 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="رقم الهوية"><input value={form.nationalId} disabled dir="ltr" className="field bg-slate-50 text-center" /></Field>
        <Field label="الاسم الكامل"><input value={form.fullName||''} onChange={e=>set('fullName',e.target.value)} className="field" /></Field>
        <Field label="رقم الهاتف"><input value={form.phone||''} onChange={e=>set('phone',e.target.value)} className="field" dir="ltr" /></Field>
        <Field label="البريد الإلكتروني"><input type="email" value={form.email||''} onChange={e=>set('email',e.target.value)} className="field" dir="ltr" /></Field>
        <Field label="تاريخ الميلاد"><input type="date" value={form.dateOfBirth?form.dateOfBirth.slice(0,10):''} onChange={e=>set('dateOfBirth',e.target.value)} className="field" dir="ltr" /></Field>
        <Field label="الجنس"><select value={form.gender||''} onChange={e=>set('gender',e.target.value)} className="field"><option value="">اختر الجنس</option><option value="MALE">ذكر</option><option value="FEMALE">أنثى</option></select></Field>
        <Field label="المدينة"><input value={form.city||''} onChange={e=>set('city',e.target.value)} className="field" /></Field>
        <Field label="العنوان"><input value={form.address||''} onChange={e=>set('address',e.target.value)} className="field" /></Field>
        <div className="sm:col-span-2"><Field label="الملاحظات"><textarea rows={4} value={form.notes||''} onChange={e=>set('notes',e.target.value)} className="field resize-y" /></Field></div>
      </div>
      {error&&<div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {message&&<div className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}
      <div className="mt-6 flex justify-end"><button disabled={saving} className="rounded-2xl bg-primary-700 px-6 py-3 font-bold text-white hover:bg-primary-800 disabled:opacity-60">{saving?'جارٍ الحفظ...':'حفظ البيانات'}</button></div>
    </form>
  </div></main>;
}
function Field({label,children}:{label:string;children:any}){return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>}
