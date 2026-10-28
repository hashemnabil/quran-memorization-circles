export function absencePeriod(date: string, endDate: string) {
  const parse = (value: string) => {
    const stamp = Date.parse(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) throw new Error('التاريخ غير صالح');
    return stamp;
  };
  const days = (parse(endDate) - parse(date)) / 86400000 + 1;
  if (days < 1 || days > 366) throw new Error('اختر فترة صحيحة من يوم إلى 366 يوماً');
  return days;
}
