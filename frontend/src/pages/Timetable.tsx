import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DAYS, PageHeader, QueryView, hhmm } from '../components/ui';

export type TSlot = { id: string; course_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null; courses?: { code: string; title: string } | { code: string; title: string }[] | null };
export const slotCourse = (s: TSlot) => (Array.isArray(s.courses) ? s.courses[0] : s.courses);

export function Timetable() {
  const q = useQuery({ queryKey: ['timetable'], queryFn: () => api<TSlot[]>('/timetable') });
  const today = new Date().getDay();
  return (
    <>
      <PageHeader eyebrow="Schedule" title="Weekly timetable" sub="Your classes, timings and rooms." />
      <QueryView q={q} empty={d => d.length === 0} emptyTitle="No timetable published yet">{d => (
        <div className="week">{DAYS.map((name, i) => {
          const items = d.filter(s => s.day_of_week === i);
          return (
            <section key={name} className={`card day ${i === today ? 'today' : ''}`}>
              <h3>{name}{i === today && <span className="chip">Today</span>}</h3>
              {items.length === 0 ? <p className="muted">No classes</p> : (
                <ul className="list">{items.map(s => (
                  <li key={s.id}><b>{hhmm(s.start_time)}</b><span>{slotCourse(s)?.title}<small>{slotCourse(s)?.code} · until {hhmm(s.end_time)}{s.room ? ` · Room ${s.room}` : ''}</small></span></li>))}
                </ul>)}
            </section>);
        })}</div>)}
      </QueryView>
    </>
  );
}
