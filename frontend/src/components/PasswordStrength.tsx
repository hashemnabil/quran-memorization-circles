type Props = { value: string };

export function PasswordStrength({ value }: Props) {
  if (!value) return <p className="mt-1 text-xs text-slate-500">مؤشر القوة للتنبيه فقط؛ يمكنك اختيار طول كلمة المرور بنفسك.</p>;
  const groups = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^a-zA-Z0-9]/.test(value)].filter(Boolean).length;
  const score = (value.length >= 12 ? 2 : value.length >= 8 ? 1 : 0) + (groups >= 3 ? 2 : groups === 2 ? 1 : 0);
  const strength = score >= 4 ? { label: 'قوية', color: 'bg-emerald-500', text: 'text-emerald-700', width: '100%' }
    : score >= 2 ? { label: 'متوسطة', color: 'bg-amber-500', text: 'text-amber-700', width: '66%' }
    : { label: 'ضعيفة', color: 'bg-red-500', text: 'text-red-700', width: '33%' };
  return <div className="mt-2" aria-live="polite">
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: strength.width }} /></div>
    <p className={`mt-1 text-xs ${strength.text}`}>قوة كلمة المرور: {strength.label} — هذا تنبيه فقط</p>
  </div>;
}
