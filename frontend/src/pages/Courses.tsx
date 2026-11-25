import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { api } from '../lib/api';
import { DAYS, PageHeader, QueryView, fmtDate, hhmm } from '../components/ui';
import { useState } from 'react';

export type Course = { id: string; code: string; title: string; description?: string | null; credit_hours: number; semester?: number | null; program?: string | null };

export function Courses() {
  const q = useQuery({ queryKey: ['courses'], queryFn: () => api<Course[]>('/courses') });
  return (
    <>
      <PageHeader eyebrow="Academics" title="My courses" sub="Courses you are enrolled in this semester." />
      <QueryView q={q} empty={d => d.length === 0} emptyTitle="No courses yet">{d => (
        <div className="grid3">{d.map(c => (
          <Link key={c.id} to={`/courses/${c.id}`} className="card course">
            <span className="chip">{c.code}</span><h3>{c.title}</h3>
            <p className="muted clamp">{c.description || 'Open this course to see its schedule, materials and assignments.'}</p>
            <small>{c.credit_hours} credit hour{Number(c.credit_hours) === 1 ? '' : 's'}{c.semester ? ` · Semester ${c.semester}` : ''}</small>
          </Link>))}
        </div>)}
      </QueryView>
    </>
  );
}

type Slot = { id: string; course_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null };
type Res = { id: string; title: string; description?: string | null; file_name: string; course_id: string };
type Asg = { id: string; title: string; due_at: string | null; max_marks: number; course_id: string };

export function CourseDetail() {
  const { id = '' } = useParams();
  const course = useQuery({ queryKey: ['course', id], queryFn: () => api<Course>(`/courses/${id}`) });
  const slots = useQuery({ queryKey: ['timetable'], queryFn: () => api<Slot[]>('/timetable') });
  const res = useQuery({ queryKey: ['resources'], queryFn: () => api<Res[]>('/resources') });
  const asg = useQuery({ queryKey: ['assignments'], queryFn: () => api<Asg[]>('/assignments') });
  const [dlErr, setDlErr] = useState('');
  async function download(rid: string) {
    setDlErr('');
    try { const { url } = await api<{ url: string }>(`/resources/${rid}/download`); window.open(url, '_blank', 'noopener'); }
    catch (e) { setDlErr(e instanceof Error ? e.message : 'Download failed.'); }
  }
  return (
    <>
      <Link to="/courses" className="back"><ArrowLeft size={15} /> All courses</Link>
      <QueryView q={course}>{c => (
        <>
          <PageHeader eyebrow={c.code} title={c.title} sub={`${c.credit_hours} credit hours${c.semester ? ` · Semester ${c.semester}` : ''}`} />
          {c.description && <section className="card"><p>{c.description}</p></section>}
          <div className="grid2">
            <section className="card"><h3>Class schedule</h3>
              <QueryView q={slots} empty={d => d.filter(s => s.course_id === id).length === 0} emptyTitle="No scheduled classes">{d => (
                <ul className="list">{d.filter(s => s.course_id === id).map(s => <li key={s.id}><b>{DAYS[s.day_of_week].slice(0, 3)}</b><span>{hhmm(s.start_time)} – {hhmm(s.end_time)}<small>{s.room ? `Room ${s.room}` : 'Room TBA'}</small></span></li>)}</ul>)}
              </QueryView></section>
            <section className="card"><h3>Course materials</h3>{dlErr && <div className="alert" role="alert">{dlErr}</div>}
              <QueryView q={res} empty={d => d.filter(r => r.course_id === id).length === 0} emptyTitle="No materials yet">{d => (
                <ul className="list">{d.filter(r => r.course_id === id).map(r => <li key={r.id}><span>{r.title}<small>{r.file_name}</small></span><button className="btn sm" onClick={() => download(r.id)}><Download size={14} /> Download</button></li>)}</ul>)}
              </QueryView></section>
          </div>
          <section className="card"><h3>Assignments</h3>
            <QueryView q={asg} empty={d => d.filter(a => a.course_id === id).length === 0} emptyTitle="No assignments">{d => (
              <ul className="list">{d.filter(a => a.course_id === id).map(a => <li key={a.id}><span>{a.title}<small>Due {fmtDate(a.due_at)} · {a.max_marks} marks</small></span></li>)}</ul>)}
            </QueryView></section>
        </>)}
      </QueryView>
    </>
  );
}
