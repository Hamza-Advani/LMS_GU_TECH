import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarClock, CalendarDays, GraduationCap, Percent, Timer } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DAYS, PageSkeleton, QueryView, hhmm } from '../components/ui';

type Slot = { id: string; code?: string; title?: string; start: string; end: string; room: string | null };
type Dash = {
  totals: { courses: number; creditHours: number };
  classesToday: Slot[];
  nextClass: (Slot & { day: number; daysAhead: number }) | null;
  attendance: { percentage: number | null; attended: number; total: number };
};

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export function Dashboard() {
  const { profile } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dash>('/dashboard') });
  const today = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const first = (profile?.full_name || '').split(' ')[0];

  return (
    <>
      <div className="page-head"><div><span className="eyebrow">{today}</span><h1>{greet()}{first ? `, ${first}` : ''}</h1></div></div>
      <section className="card profile-strip">
        <span className="avatar lg">{(profile?.full_name || '?').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}</span>
        <div className="profile-meta">
          <b>{profile?.full_name}</b>
          <dl>
            <div><dt>Roll no.</dt><dd>{profile?.roll_number || '—'}</dd></div>
            <div><dt>Program</dt><dd>{profile?.program || '—'}</dd></div>
            <div><dt>Department</dt><dd>{profile?.department || '—'}</dd></div>
            {profile?.semester ? <div><dt>Semester</dt><dd>{profile.semester}</dd></div> : null}
          </dl>
        </div>
      </section>

      <QueryView q={q} skeleton={<PageSkeleton />}>{d => {
        const n = d.nextClass;
        const when = n ? (n.daysAhead === 0 ? 'Today' : n.daysAhead === 1 ? 'Tomorrow' : DAYS[n.day]) : '';
        const att = d.attendance.percentage;
        return (
          <>
            <div className="grid4">
              <Link to="/timetable" className="card stat"><span className="stat-icon"><CalendarDays size={18} /></span><small>Classes today</small><strong>{d.classesToday.length}</strong><em>{d.classesToday.length ? d.classesToday.map(c => c.code).join(', ') : 'No classes today'}</em></Link>
              <Link to="/attendance" className="card stat"><span className="stat-icon"><Percent size={18} /></span><small>Attendance</small><strong>{att === null ? '—' : `${att}%`}</strong><em>{att === null ? 'No records yet' : `${d.attendance.attended} of ${d.attendance.total} classes`}</em></Link>
              <Link to="/courses" className="card stat"><span className="stat-icon"><BookOpen size={18} /></span><small>Total courses</small><strong>{d.totals.courses}</strong><em>This semester</em></Link>
              <Link to="/courses" className="card stat"><span className="stat-icon"><GraduationCap size={18} /></span><small>Credit hours</small><strong>{d.totals.creditHours}</strong><em>Enrolled load</em></Link>
            </div>

            <div className="grid2">
              <Link to="/timetable" className="card next-class">
                <span className="eyebrow"><Timer size={13} /> Next class</span>
                {n ? <><h2>{n.title}</h2><p>{n.code} · {when}, {hhmm(n.start)} – {hhmm(n.end)}</p><p className="muted">{n.room ? `Room ${n.room}` : 'Room to be announced'}</p></>
                   : <><h2>No upcoming class</h2><p className="muted">Nothing is scheduled in the coming week.</p></>}
              </Link>
              <section className="card">
                <span className="eyebrow"><CalendarClock size={13} /> Today’s schedule</span>
                {d.classesToday.length === 0 ? <p className="muted pad">You have a free day. Enjoy it!</p> : (
                  <ul className="list">{d.classesToday.map(c => <li key={c.id}><b>{hhmm(c.start)}</b><span>{c.title}<small>{c.code}{c.room ? ` · Room ${c.room}` : ''}</small></span></li>)}</ul>
                )}
              </section>
            </div>
          </>
        );
      }}</QueryView>
    </>
  );
}
