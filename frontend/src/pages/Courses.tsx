import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DAYS, PageHeader, QueryView, fmtDate, hhmm } from '../components/ui';

export type Course = { id: string; code: string; title: string; description?: string | null; credit_hours: number; semester?: number | null; program?: string | null; instructor?: string | null; teacher_id?: string | null };

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
            <small>{c.credit_hours} credit hour{Number(c.credit_hours) === 1 ? '' : 's'}{c.instructor ? ` · ${c.instructor}` : ''}</small>
          </Link>))}
        </div>)}
      </QueryView>
    </>
  );
}

type Overview = {
  course: Course;
  slots: { id: string; day_of_week: number; start_time: string; end_time: string; room: string | null }[];
  attendance: { percentage: number | null; attended: number; total: number; recent: { attended_on: string; status: string }[] };
  marks: { id: string; assessment: string; score: number; max_score: number; weightage: number | null }[];
  result: { percentage: number | null; grade: string | null; weighted: boolean; rawObtained: number; rawTotal: number };
};
type Res = { id: string; title: string; description?: string | null; file_name: string; course_id: string };
type Asg = { id: string; title: string; due_at: string | null; max_marks: number; course_id: string };

export function CourseDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const isStudent = profile?.role === 'student';
  const ov = useQuery({ queryKey: ['course', id], queryFn: () => api<Overview>(`/courses/${id}/overview`) });
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
      <QueryView q={ov}>{({ course: c, slots, attendance: a, marks, result }) => (
        <>
          <PageHeader eyebrow={c.code} title={c.title} sub={`${c.credit_hours} credit hours${c.instructor ? ` · Instructor: ${c.instructor}` : ''}`} />
          {c.description && <section className="card"><p>{c.description}</p></section>}
          {isStudent && <div className="grid2">
            <section className="card"><h3>Attendance</h3>
              <strong className="big">{a.percentage === null ? '—' : `${a.percentage}%`}</strong>
              <small>{a.total ? `${a.attended} of ${a.total} classes attended` : 'No attendance recorded yet'}</small>
            </section>
            <section className="card"><h3>Result so far</h3>
              <strong className="big">{result.percentage === null ? '—' : `${result.percentage}%`}{result.grade && <span className="chip grade">{result.grade}</span>}</strong>
              <small>{marks.length ? `${marks.length} assessment${marks.length > 1 ? 's' : ''} · ${result.rawObtained}/${result.rawTotal} marks` : 'No marks published yet'}</small>
            </section>
          </div>}
          <div className="grid2">
            <section className="card"><h3>Class schedule</h3>
              {slots.length === 0 ? <p className="muted">No scheduled classes.</p> : <ul className="list">{slots.map(s => <li key={s.id}><b>{DAYS[s.day_of_week].slice(0, 3)}</b><span>{hhmm(s.start_time)} – {hhmm(s.end_time)}<small>{s.room ? `Room ${s.room}` : 'Room TBA'}</small></span></li>)}</ul>}
            </section>
            <section className="card"><h3>Course materials</h3>{dlErr && <div className="alert" role="alert">{dlErr}</div>}
              <QueryView q={res} empty={d => d.filter(r => r.course_id === id).length === 0} emptyTitle="No materials yet">{d => (
                <ul className="list">{d.filter(r => r.course_id === id).map(r => <li key={r.id}><span>{r.title}<small>{r.file_name}</small></span><button className="btn sm" onClick={() => download(r.id)}><Download size={14} /> Download</button></li>)}</ul>)}
              </QueryView></section>
          </div>
          {isStudent && marks.length > 0 && <section className="card"><h3>Marks</h3><div className="table-wrap"><table><thead><tr><th>Assessment</th><th>Marks</th><th>Weight</th></tr></thead><tbody>{marks.map(m => <tr key={m.id}><td>{m.assessment}</td><td>{m.score}/{m.max_score}</td><td>{m.weightage != null ? `${m.weightage}%` : '—'}</td></tr>)}</tbody></table></div></section>}
          <section className="card"><h3>Assignments</h3>
            <QueryView q={asg} empty={d => d.filter(x => x.course_id === id).length === 0} emptyTitle="No assignments">{d => (
              <ul className="list">{d.filter(x => x.course_id === id).map(x => <li key={x.id}><span>{x.title}<small>Due {fmtDate(x.due_at)} · {x.max_marks} marks</small></span></li>)}</ul>)}
            </QueryView>
            <Link to="/assignments" className="more">Open assignments</Link></section>
        </>)}
      </QueryView>
    </>
  );
}
