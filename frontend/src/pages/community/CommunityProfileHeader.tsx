import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button } from '@/components/ui';
import { IconEdit, IconSettings, IconUser, IconBook } from '@/components/ui/Icons';
import { ROLE_LABELS } from '@/lib/labels';
import { api } from '@/lib/api';
import './community-profile.css';

type Profile = { fullName: string; nickname?: string | null; username?: string; bio?: string | null; role: string; avatarUrl?: string | null; coverAssetId?: string | null };

type Props = { profile: Profile; own: boolean; schoolName: string; saving: boolean; onSaveNickname: (nickname: string) => Promise<unknown> };

export default function CommunityProfileHeader({ profile, own, schoolName, saving, onSaveNickname }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const editNickname = () => { setDraft(profile.nickname || ''); setEditing(true); };
  const saveNickname = async (event: FormEvent) => {
    event.preventDefault();
    try { await onSaveNickname(draft.trim()); setEditing(false); } catch { /* The mutation displays the save error and preserves the draft. */ }
  };
  return <section className="community-profile-card" aria-label="بطاقة الملف الشخصي" dir="rtl">
    <div className="profile-cover community-profile-cover" style={profile.coverAssetId ? { backgroundImage: `linear-gradient(90deg,#102f29cc,#102f2955),url("${String(api.defaults.baseURL).replace(/\/$/, '')}/founder-assets/${encodeURIComponent(profile.coverAssetId)}/content")` } : undefined}>
      <div className="community-profile-school"><IconBook size={20}/><span>{schoolName}</span></div>
      <span className="sr-only">غلاف الملف الشخصي</span>
    </div>
    <div className="community-profile-content">
      <div className="community-profile-topline">
        <div className="community-profile-avatar"><Avatar name={profile.fullName} src={profile.avatarUrl} size={104} preview /></div>
        {own && <Link to="/profile/settings" className="community-profile-settings" aria-label="إعدادات الملف الشخصي"><IconSettings size={17}/>تعديل الملف الشخصي</Link>}
      </div>
      <div className="community-profile-identity">
        <span className="community-profile-eyebrow">الملف الشخصي</span>
        <h1>{profile.fullName}</h1>
        <div className="community-profile-meta"><span className="community-profile-role"><IconUser size={14}/>{ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] ?? profile.role}</span>{profile.nickname && <span>{profile.nickname}</span>}{profile.username && <span className="community-profile-username" dir="ltr">@{profile.username}</span>}</div>
        {profile.bio && <p className="community-profile-bio">{profile.bio}</p>}
      </div>
      {own && <div className="community-profile-footer">
        <div><span className="community-profile-field-label">الكنية</span><p>{profile.nickname || 'لم تُضف كنية بعد'}</p></div>
        {!editing && <button type="button" className="community-profile-text-button" onClick={editNickname}><IconEdit size={16}/>{profile.nickname ? 'تعديل الكنية' : 'إضافة كنية'}</button>}
        {editing && <form onSubmit={saveNickname} className="community-profile-nickname-form">
          <label htmlFor="community-profile-nickname" className="sr-only">الكنية</label>
          <input id="community-profile-nickname" autoFocus className="input" maxLength={60} value={draft} onChange={event => setDraft(event.target.value)} placeholder="اكتب الكنية" disabled={saving}/>
          <div className="community-profile-form-actions"><Button type="submit" loading={saving}>حفظ الكنية</Button><Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>إلغاء</Button></div>
        </form>}
      </div>}
    </div>
  </section>;
}
