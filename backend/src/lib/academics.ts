/** Pure academic calculations (unit-tested). */

export type AttendanceRow = { course_id: string; status: string };
export const ATTENDED = new Set(['present', 'late']);

/** Attendance % = (present + late) / all recorded sessions. Returns null when nothing is recorded (never a misleading 0%). */
export function summarizeAttendance(rows: AttendanceRow[]) {
  const by = new Map<string, { total: number; attended: number }>();
  for (const r of rows) {
    const e = by.get(r.course_id) ?? { total: 0, attended: 0 };
    e.total++; if (ATTENDED.has(r.status)) e.attended++;
    by.set(r.course_id, e);
  }
  const total = rows.length;
  const attended = [...by.values()].reduce((n, e) => n + e.attended, 0);
  return { total, attended, percentage: pct(attended, total), byCourse: by };
}
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** DEMO grading scale. The official GU Tech scale was not available; replace GRADE_SCALE when it is confirmed. */
export const GRADE_SCALE: { min: number; grade: string; points: number }[] = [
  { min: 85, grade: 'A', points: 4.0 }, { min: 80, grade: 'A-', points: 3.67 }, { min: 75, grade: 'B+', points: 3.33 },
  { min: 70, grade: 'B', points: 3.0 }, { min: 65, grade: 'B-', points: 2.67 }, { min: 60, grade: 'C+', points: 2.33 },
  { min: 55, grade: 'C', points: 2.0 }, { min: 50, grade: 'D', points: 1.0 }, { min: 0, grade: 'F', points: 0 },
];
export const gradeFor = (percentage: number | null) => (percentage === null ? null : GRADE_SCALE.find(g => percentage >= g.min)!);

export type MarkRow = { score: number | string; max_score: number | string; weightage?: number | string | null };
/** If every item carries a weightage, the result is weighted; otherwise it is raw obtained/total. */
export function courseResult(items: MarkRow[]) {
  const rawObtained = items.reduce((n, m) => n + Number(m.score), 0);
  const rawTotal = items.reduce((n, m) => n + Number(m.max_score), 0);
  const weighted = items.length > 0 && items.every(m => m.weightage != null && Number(m.weightage) > 0);
  let percentage: number | null;
  let weightedObtained: number | null = null, weightedTotal: number | null = null;
  if (weighted) {
    weightedObtained = items.reduce((n, m) => n + (Number(m.score) / Number(m.max_score)) * Number(m.weightage), 0);
    weightedTotal = items.reduce((n, m) => n + Number(m.weightage), 0);
    percentage = pct(weightedObtained, weightedTotal);
    weightedObtained = Math.round(weightedObtained * 100) / 100;
  } else percentage = pct(rawObtained, rawTotal);
  const g = gradeFor(percentage);
  return { rawObtained, rawTotal, weighted, weightedObtained, weightedTotal, percentage, grade: g?.grade ?? null, points: g?.points ?? null };
}

/** Day-of-week and minutes-since-midnight in the institute timezone. */
export function nowIn(tz: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export type SlotLike = { day_of_week: number; start_time: string };
/** First slot strictly after `now` (today's later slots, then following days up to a week). */
export function nextSlot<T extends SlotLike>(slots: T[], now: { day: number; minutes: number }) {
  const sorted = [...slots].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = (now.day + ahead) % 7;
    const hit = sorted.find(s => s.day_of_week === day && (ahead > 0 || toMin(s.start_time) > now.minutes));
    if (hit) return { slot: hit, daysAhead: ahead };
  }
  return null;
}
