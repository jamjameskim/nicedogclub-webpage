const DAY = 86_400_000;
const KST = 9 * 60 * 60 * 1000;
const calendarDay = value => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor((timestamp + KST) / DAY) : null;
};

// Korea calendar dates, including the missing date as day one.
export function daysMissing(lastSeenAt, until = new Date()) {
  const first = calendarDay(lastSeenAt), last = calendarDay(until);
  return first === null || last === null ? null : Math.max(1, last - first + 1);
}
export function missingLabel(item, now = new Date()) {
  const closed = item.status === 'resolved';
  if (calendarDay(item.last_seen_at) === null) return '실종일 미기록';
  const days = daysMissing(item.last_seen_at, closed ? (item.resolved_at ?? null) : now);
  if (days === null) return closed ? '종료일 미기록' : '실종일 미기록';
  return closed ? `실종 ${days}일째 종료` : `실종 ${days}일째`;
}
export function dateKst(value) {
  if (calendarDay(value) === null) return '미기록';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}
export function publicPhotoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    // Existing records contain either a complete public URL or a bucket path.
    const url = /^https?:\/\//i.test(value.trim()) ? new URL(value) : new URL(value, `${process.env.SUPABASE_URL}/storage/v1/object/public/public-photos/`);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return url.href;
  } catch { return null; }
}
export async function restFetch(path, init = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Missing database configuration');
  return fetch(`${base}/rest/v1${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10000),
  });
}
