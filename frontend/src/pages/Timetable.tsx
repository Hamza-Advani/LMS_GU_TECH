import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DAYS, PageHeader, QueryView, hhmm } from '../components/ui';

export type TSlot = { id: string; course_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null; instructor?: string | null; courses?: { code: string; title: string } | { code: string; title: string }[] | null };
export const slotCourse = (s: TSlot) => (Array.isArray(s.courses) ? s.courses[0] : s.courses);

function SlotList({ items }: { items: TSlot[] }) {
  return <ul className="list">{items.map(s => (
    <li key={s.id}><b>{hhmm(s.start_time)}</b><span>{slotCourse(s)?.title}<small>{slotCourse(s)?.code} · {hhmm(s.start_time)} – {hhmm(s.end_time)}{s.room ? ` · Room ${s.room}` : ''}{s.instructor ? ` · ${s.instructor}` : ''}</small></span></li>))}</ul>;
}

export function Timetable() {
  const q = useQuery({ queryKey: ['timetable'], queryFn: () => api<TSlot[]>('/timetable') });
  const [view, setView] = useState<'week' | 'day'>('week');
  const [day, setDay] = useState(new Date().getDay());
  const today = new Date().getDay();
  return (
    <>
      <PageHeader eyebrow="Schedule" title="Timetable" sub="Your classes, timings, rooms and instructors."
        action={<div className="tabs" role="tablist" aria-label="Timetable view">{(['week', 'day'] as const).map(v => <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'week' ? 'Weekly' : 'Daily'}</button>)}</div>} />
      <QueryView q={q} empty={d => d.length === 0} emptyTitle="No timetable published yet">{d => view === 'week' ? (
        <div className="week">{DAYS.map((name, i) => {
          const items = d.filter(s => s.day_of_week === i);
          return (
            <section key={name} className={`card day ${i === today ? 'today' : ''}`} aria-label={name}>
              <h3>{name}{i === today && <span className="chip">Today</span>}</h3>
              {items.length === 0 ? <p className="muted">{i === 0 || i === 6 ? 'Weekend: no classes' : 'No classes'}</p> : <SlotList items={items} />}
            </section>);
        })}</div>
      ) : (
        <>
          <div className="tabs" aria-label="Choose day">{DAYS.map((n, i) => <button key={n} className={day === i ? 'on' : ''} onClick={() => setDay(i)}>{n.slice(0, 3)}{i === today ? ' •' : ''}</button>)}</div>
          <section className="card day-view"><h3>{DAYS[day]}{day === today && <span className="chip">Today</span>}</h3>
            {d.filter(s => s.day_of_week === day).length === 0 ? <p className="muted">Free day: no classes scheduled.</p> : <SlotList items={d.filter(s => s.day_of_week === day)} />}
          </section>
        </>)}
      </QueryView>
    </>
  );
}
