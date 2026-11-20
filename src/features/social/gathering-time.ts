const pad = (value: number) => String(value).padStart(2, '0');

function localText(date: Date) {
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-') +
    ' ' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  );
}

export function gatheringTimeChoices(now = new Date()) {
  const presets = [
    { label: '今晚 19:00', days: 0, hour: 19 },
    { label: '明天 12:00', days: 1, hour: 12 },
    { label: '明晚 19:00', days: 1, hour: 19 },
    { label: '周六 14:00', weekday: 6, hour: 14 },
    { label: '周日 18:00', weekday: 0, hour: 18 },
  ];
  return presets.flatMap(({ label, days, hour, weekday }) => {
    const target = new Date(now);
    const offset = weekday === undefined ? (days ?? 0) : (weekday + 7 - now.getDay()) % 7;
    target.setDate(now.getDate() + offset);
    target.setHours(hour, 0, 0, 0);
    if (weekday !== undefined && target <= now) target.setDate(target.getDate() + 7);
    return target > now ? [{ label, value: localText(target) }] : [];
  });
}
