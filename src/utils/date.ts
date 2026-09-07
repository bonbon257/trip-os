export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseDate = (iso: string) => new Date(`${iso}T00:00:00`);

export const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

export const diffDays = (from: string, to: string) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);

export const dateRange = (start: string, end: string) => {
  const out: string[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= Math.max(n, 0); i++) out.push(addDays(start, i));
  return out;
};

export const fmtMD = (iso: string) => {
  const d = parseDate(iso);
  return `${d.getMonth() + 1}.${`${d.getDate()}`.padStart(2, '0')}`;
};

export const fmtMDWeek = (iso: string) => {
  const d = parseDate(iso);
  return `${fmtMD(iso)} ${WEEKDAYS[d.getDay()]}`;
};

export const fmtCN = (iso: string) => {
  const d = parseDate(iso);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

/** "09:30" → 分钟数 */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMinutes = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${`${Math.floor(m / 60)}`.padStart(2, '0')}:${`${m % 60}`.padStart(2, '0')}`;
};

export const addMinutes = (hhmm: string, delta: number) => fromMinutes(toMinutes(hhmm) + delta);

export const durationText = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} min` : `${h} 小时`;
};

export const nowHHMM = () => {
  const d = new Date();
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const todayISO = () => toISODate(new Date());

/**
 * 「这个周末」的周六（ISO date），WeekendPlan.weekendOf 的基准。
 *
 * 判定：周六 → 今天；周日 → 昨天（仍属本周末）；周一~周五 → 下一个周六。
 */
export const upcomingSaturday = (iso = todayISO()) => {
  const d = parseDate(iso).getDay(); // 0=周日 … 6=周六
  if (d === 6) return iso;
  if (d === 0) return addDays(iso, -1);
  return addDays(iso, 6 - d);
};
