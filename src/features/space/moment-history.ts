export const historyLabels = { all: '全部历史', '3d': '最近三天', '180d': '最近半年', custom: '自定义时间' } as const;
export type MomentHistory = { history: keyof typeof historyLabels; date?: string | null; zone?: string | null };

export function calendarDate(year: number, month: number, day: number) {
  if (![year, month, day].every(Number.isInteger) || year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined;
  return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

export function visibleSince(at: number, value: MomentHistory, now = Date.now()) {
  if (value.history === 'all') return true;
  if (value.history === '3d' || value.history === '180d') return at >= now - (value.history === '3d' ? 3 : 180) * 86_400_000;
  if (!value.date || !value.zone || !Number.isFinite(at)) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: value.zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const date = calendarDate(get('year'),get('month'),get('day'));
    return !!date && date >= value.date;
  } catch { return false; }
}
