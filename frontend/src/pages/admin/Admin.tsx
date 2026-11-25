import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { DAYS, PageHeader, QueryView, Spinner, hhmm } from '../../components/ui';
import type { Course } from '../Courses';
import { slotCourse, type TSlot } from '../Timetable';

type Field = { name: string; label: string; type?: 'text' | 'number' | 'email' | 'password' | 'date' | 'time' | 'datetime-local' | 'textarea' | 'select' | 'checkbox'; options?: { value: string; label: string }[]; required?: boolean; optional?: boolean };

/** Generic validated form that posts JSON to an API endpoint and reports server errors. */
function ApiForm({ title, fields, path, build, invalidate, cta = 'Save' }: { title: string; fields: Field[]; path: string; build?: (v: Record<string, string>) => unknown; invalidate: string[]; cta?: string }) {
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const m = useMutation({
    mutationFn: (body: unknown) => api(path, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setErr(''); setOk('Saved.'); invalidate.forEach(k => qc.invalidateQueries({ queryKey: [k] })); },
    onError: e => { setOk(''); setErr(e instanceof Error ? e.message : 'Could not save.'); },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form), v: Record<string, string> = {};
    for (const f of fields) v[f.name] = f.type === 'checkbox' ? (fd.get(f.name) ? 'true' : '') : String(fd.get(f.name) ?? '').trim();
    const missing = fields.find(f => f.required !== false && !f.optional && f.type !== 'checkbox' && !v[f.name]);
    if (missing) { setOk(''); setErr(`${missing.label} is required.`); return; }
    m.mutate(build ? build(v) : v, { onSuccess: () => form.reset() });
  }
  return (
    <form className="card admin-form" onSubmit={submit} noValidate>
      <h3>{title}</h3>
      <div className="form-grid">{fields.map(f => (
        <label key={f.name} className={f.type === 'textarea' ? 'wide' : f.type === 'checkbox' ? 'check' : ''}>
          {f.type === 'checkbox' ? <><input type="checkbox" name={f.name} /> {f.label}</> : <>{f.label}{f.optional ? ' (optional)' : ''}
            {f.type === 'textarea' ? <textarea name={f.name} rows={3} />
              : f.type === 'select' ? <select name={f.name} defaultValue=""><option value="" disabled>Select…</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : <input name={f.name} type={f.type || 'text'} autoComplete="off" />}</>}
        </label>))}
      </div>
      {err && <div className="alert" role="alert">{err}</div>}{ok && <div className="success" role="status">{ok}</div>}
      <button className="btn primary" disabled={m.isPending}>{m.isPending ? <Spinner /> : cta}</button>
    </form>
  );
}

const useCourses = () => useQuery({ queryKey: ['courses'], queryFn: () => api<Course[]>('/courses') });
const courseOpts = (c?: Course[]) => (c || []).map(x => ({ value: x.id, label: `${x.code} · ${x.title}` }));
type Student = { id: string; full_name: string; email: string; roll_number: string | null; program: string | null; semester: number | null };
type RosterRow = { student_id: string; profiles: { id: string; full_name: string; roll_number: string | null } | { id: string; full_name: string; roll_number: string | null }[] | null };
const prof = (r: RosterRow) => (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles);

function StudentsPanel() {
  const students = useQuery({ queryKey: ['admin-students'], queryFn: () => api<Student[]>('/admin/students') });
  const courses = useCourses();
  return (
    <div className="stack">
      <ApiForm title="Register student" path="/admin/students" invalidate={['admin-students']} cta="Create student" fields={[
        { name: 'roll_number', label: 'Roll number' }, { name: 'full_name', label: 'Full name' }, { name: 'email', label: 'Registered email', type: 'email' },
        { name: 'password', label: 'Temporary password (12+ chars)', type: 'password' }, { name: 'program', label: 'Program', optional: true }, { name: 'department', label: 'Department', optional: true }, { name: 'semester', label: 'Semester', type: 'number', optional: true }]}
        build={v => ({ ...v, semester: v.semester ? Number(v.semester) : undefined, program: v.program || undefined, department: v.department || undefined })} />
      <ApiForm title="Enroll student in course" path="/enrollments" invalidate={['courses', 'dashboard']} cta="Enroll" fields={[
        { name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data) },
        { name: 'student_id', label: 'Student', type: 'select', options: (students.data || []).map(s => ({ value: s.id, label: `${s.roll_number ?? '—'} · ${s.full_name}` })) }]} />
      <section className="card"><h3>Students</h3>
        <QueryView q={students} empty={d => d.length === 0} emptyTitle="No students yet">{d => (
          <div className="table-wrap"><table><thead><tr><th>Roll no.</th><th>Name</th><th>Program</th><th>Sem.</th></tr></thead>
            <tbody>{d.map(s => <tr key={s.id}><td>{s.roll_number}</td><td>{s.full_name}<small className="block">{s.email}</small></td><td>{s.program || '—'}</td><td>{s.semester ?? '—'}</td></tr>)}</tbody></table></div>)}</QueryView></section>
    </div>
  );
}

function CoursesPanel() {
  const courses = useCourses(); const qc = useQueryClient();
  const del = useMutation({ mutationFn: (id: string) => api(`/courses/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }) });
  return (
    <div className="stack">
      <ApiForm title="Add course" path="/courses" invalidate={['courses', 'dashboard']} cta="Create course" fields={[
        { name: 'code', label: 'Course code' }, { name: 'title', label: 'Title' }, { name: 'credit_hours', label: 'Credit hours', type: 'number' }, { name: 'semester', label: 'Semester', type: 'number', optional: true }, { name: 'program', label: 'Program', optional: true }, { name: 'description', label: 'Description', type: 'textarea', optional: true }]}
        build={v => ({ code: v.code, title: v.title, credit_hours: Number(v.credit_hours), semester: v.semester ? Number(v.semester) : null, program: v.program || null, description: v.description || undefined })} />
      <section className="card"><h3>Courses</h3>
        <QueryView q={courses} empty={d => d.length === 0} emptyTitle="No courses yet">{d => (
          <ul className="list">{d.map(c => <li key={c.id}><span>{c.code} · {c.title}<small>{c.credit_hours} credit hours</small></span>
            <button className="btn sm danger" aria-label={`Delete ${c.code}`} onClick={() => { if (confirm(`Delete ${c.code}? This removes its timetable, attendance and marks.`)) del.mutate(c.id); }}><Trash2 size={14} /></button></li>)}</ul>)}</QueryView></section>
    </div>
  );
}

function TimetablePanel() {
  const courses = useCourses(); const qc = useQueryClient();
  const slots = useQuery({ queryKey: ['timetable'], queryFn: () => api<TSlot[]>('/timetable') });
  const del = useMutation({ mutationFn: (id: string) => api(`/timetable/${id}`, { method: 'DELETE' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['timetable'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); } });
  return (
    <div className="stack">
      <ApiForm title="Add class slot" path="/timetable" invalidate={['timetable', 'dashboard']} cta="Add slot" fields={[
        { name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data) },
        { name: 'day_of_week', label: 'Day', type: 'select', options: DAYS.map((d, i) => ({ value: String(i), label: d })) },
        { name: 'start_time', label: 'Start', type: 'time' }, { name: 'end_time', label: 'End', type: 'time' }, { name: 'room', label: 'Room', optional: true }]}
        build={v => ({ ...v, day_of_week: Number(v.day_of_week), room: v.room || undefined })} />
      <section className="card"><h3>Slots</h3>
        <QueryView q={slots} empty={d => d.length === 0} emptyTitle="No slots yet">{d => (
          <ul className="list">{d.map(s => <li key={s.id}><span>{slotCourse(s)?.code} · {DAYS[s.day_of_week]}<small>{hhmm(s.start_time)} – {hhmm(s.end_time)}{s.room ? ` · ${s.room}` : ''}</small></span>
            <button className="btn sm danger" aria-label="Delete slot" onClick={() => del.mutate(s.id)}><Trash2 size={14} /></button></li>)}</ul>)}</QueryView></section>
    </div>
  );
}

function RosterPicker({ children }: { children: (courseId: string, roster: RosterRow[]) => React.ReactNode }) {
  const courses = useCourses(); const [cid, setCid] = useState('');
  const roster = useQuery({ queryKey: ['roster', cid], queryFn: () => api<RosterRow[]>(`/courses/${cid}/roster`), enabled: !!cid });
  return (
    <div className="stack">
      <section className="card"><label>Course<select value={cid} onChange={e => setCid(e.target.value)}><option value="">Select a course…</option>{courseOpts(courses.data).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label></section>
      {cid && <QueryView q={roster} empty={d => d.length === 0} emptyTitle="No students enrolled in this course">{d => children(cid, d)}</QueryView>}
    </div>
  );
}

function AttendancePanel() {
  return <RosterPicker>{(cid, roster) => <AttendanceSheet key={cid} cid={cid} roster={roster} />}</RosterPicker>;
}
function AttendanceSheet({ cid, roster }: { cid: string; roster: RosterRow[] }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [st, setSt] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const m = useMutation({
    mutationFn: () => api<{ saved: number }>('/attendance', { method: 'POST', body: JSON.stringify({ course_id: cid, attended_on: date, records: roster.map(r => ({ student_id: r.student_id, status: st[r.student_id] || 'present' })) }) }),
    onSuccess: r => { setErr(''); setMsg(`Saved ${r.saved} records.`); }, onError: e => { setMsg(''); setErr(e instanceof Error ? e.message : 'Could not save.'); },
  });
  return (
    <section className="card"><h3>Mark attendance</h3>
      <label>Date<input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} /></label>
      <div className="table-wrap"><table><thead><tr><th>Roll no.</th><th>Student</th><th>Status</th></tr></thead><tbody>{roster.map(r => { const p = prof(r); return (
        <tr key={r.student_id}><td>{p?.roll_number || '—'}</td><td>{p?.full_name}</td><td><select aria-label={`Status for ${p?.full_name}`} value={st[r.student_id] || 'present'} onChange={e => setSt({ ...st, [r.student_id]: e.target.value })}>{['present', 'absent', 'late', 'leave'].map(s => <option key={s}>{s}</option>)}</select></td></tr>); })}</tbody></table></div>
      {err && <div className="alert" role="alert">{err}</div>}{msg && <div className="success" role="status">{msg}</div>}
      <button className="btn primary" disabled={m.isPending || !date} onClick={() => m.mutate()}>{m.isPending ? <Spinner /> : 'Save attendance'}</button>
    </section>
  );
}

function MarksPanel() {
  return <RosterPicker>{(cid, roster) => <ApiForm key={cid} title="Publish result" path="/results" invalidate={['results']} cta="Publish" fields={[
    { name: 'student_id', label: 'Student', type: 'select', options: roster.map(r => ({ value: r.student_id, label: `${prof(r)?.roll_number ?? '—'} · ${prof(r)?.full_name}` })) },
    { name: 'assessment', label: 'Assessment (e.g. Midterm)' }, { name: 'score', label: 'Score', type: 'number' }, { name: 'max_score', label: 'Out of', type: 'number' }, { name: 'feedback', label: 'Feedback', type: 'textarea', optional: true }]}
    build={v => ({ ...v, course_id: cid, score: Number(v.score), max_score: Number(v.max_score), feedback: v.feedback || undefined })} />}</RosterPicker>;
}

function AssignmentsPanel() {
  const courses = useCourses();
  return <ApiForm title="Create assignment" path="/assignments" invalidate={['assignments-full', 'assignments', 'notifications']} cta="Create" fields={[
    { name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data) }, { name: 'title', label: 'Title' }, { name: 'max_marks', label: 'Max marks', type: 'number' }, { name: 'due_at', label: 'Due', type: 'datetime-local', optional: true }, { name: 'description', label: 'Instructions', type: 'textarea', optional: true }]}
    build={v => ({ course_id: v.course_id, title: v.title, max_marks: Number(v.max_marks), due_at: v.due_at ? new Date(v.due_at).toISOString() : undefined, description: v.description || undefined })} />;
}

function AnnouncementsPanel() {
  const courses = useCourses();
  return <ApiForm title="Post announcement" path="/announcements" invalidate={['notifications']} cta="Publish" fields={[
    { name: 'title', label: 'Title' }, { name: 'body', label: 'Message', type: 'textarea' }, { name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data), optional: true }, { name: 'is_global', label: 'Send to the whole campus', type: 'checkbox' }]}
    build={v => ({ title: v.title, body: v.body, course_id: v.course_id || null, is_global: v.is_global === 'true' })} />;
}

const TABS = [
  { key: 'students', label: 'Students', roles: ['admin'], el: <StudentsPanel /> },
  { key: 'courses', label: 'Courses', roles: ['admin'], el: <CoursesPanel /> },
  { key: 'timetable', label: 'Timetable', roles: ['admin'], el: <TimetablePanel /> },
  { key: 'attendance', label: 'Attendance', roles: ['admin', 'teacher'], el: <AttendancePanel /> },
  { key: 'marks', label: 'Marks', roles: ['admin', 'teacher'], el: <MarksPanel /> },
  { key: 'assignments', label: 'Assignments', roles: ['admin', 'teacher'], el: <AssignmentsPanel /> },
  { key: 'announcements', label: 'Announcements', roles: ['admin', 'teacher'], el: <AnnouncementsPanel /> },
];

export function Admin() {
  const { profile } = useAuth();
  const tabs = TABS.filter(t => profile && t.roles.includes(profile.role));
  const [key, setKey] = useState(tabs[0]?.key);
  return (
    <>
      <PageHeader eyebrow={profile?.role === 'admin' ? 'Administration' : 'Teaching'} title="Management console" />
      <div className="tabs" role="tablist">{tabs.map(t => <button key={t.key} role="tab" aria-selected={key === t.key} className={key === t.key ? 'on' : ''} onClick={() => setKey(t.key)}>{t.label}</button>)}</div>
      {tabs.find(t => t.key === key)?.el}
    </>
  );
}
