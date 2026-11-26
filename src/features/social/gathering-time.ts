export const padTime = (value: number) => String(value).padStart(2, '0');

export function localDay(date: Date) {
  return [date.getFullYear(), padTime(date.getMonth() + 1), padTime(date.getDate())].join('-');
}

export function calendarDays(year: number, month: number) {
  const start = new Date(year, month, 1).getDay();
  const length = new Date(year, month + 1, 0).getDate();
  return [...Array<null>(start).fill(null), ...Array.from({ length }, (_, index) => index + 1)];
}

export function gatheringStart(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('请为每个候选同时选择日期和时间。');
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute] = match;
  const [year, month, day, hour, minute] = [rawYear, rawMonth, rawDay, rawHour, rawMinute].map(Number);
  const date = new Date(year, month - 1, day, 0, 0);
  if (localDay(date) !== value.slice(0, 10) || hour > 24 || minute > 59 || (hour === 24 && minute !== 0))
    throw new Error('请重新选择有效的日期和时间。');
  date.setHours(hour, minute);
  if (date.getHours() !== hour % 24 || date.getMinutes() !== minute)
    throw new Error('此时间在当地时区不可用，请另选时间。');
  return date.toISOString();
}
