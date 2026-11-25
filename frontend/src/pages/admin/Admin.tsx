import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { DAYS, PageHeader, QueryView, Spinner, fmtDate, hhmm } from '../../components/ui';
import type { Course } from '../Courses';
import { slotCourse, type TSlot } from '../Timetable';

type Opt = { value: string; label: string };
type Field = { name: string; label: string; type?: 'text' | 'number' | 'email' | 'password' | 'date' | 'time' | 'datetime-local' | 'textarea' | 'select' | 'checkbox' | 'file'; options?: Opt[]; optional?: boolean; step?: string; hint?: string; only?: 'create' };
type Values = Record<string, string>;

/** Controlled, validated form used for both create and edit. Server errors are shown inline. */
function RecordForm({ title, fields, initial, submitLabel, onSubmit, onCancel }: { title: string; fields: Field[]; initial?: Values; submitLabel: string; onSubmit: (v: Values, files: Record<string, File | undefined>) => Promise<void>; onCancel?: () => void }) {
  const editing = !!initial;
  const [v, setV] = useState<Values>(initial ?? {});
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  const shown = fields.filter(f => !(editing && f.only === 'create'));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setOk('');
    for (const f of shown) {
      if (f.optional || f.type === 'checkbox') continue;
      if (f.type === 'file' ? !files[f.name] : !(v[f.name] ?? '').toString().trim()) { setErr(`${f.label} is required.`); return; }
      if (f.type === 'number' && !(Number(v[f.name]) >= 0)) { setErr(`${f.label} must be a valid number.`); return; }
    }
    setBusy(true); setErr('');
    try { await onSubmit(v, files); setOk(editing ? 'Changes saved.' : 'Saved successfully.'); if (!editing) { setV({}); setFiles({}); (e.target as HTMLFormElement).reset(); } }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <form className="card admin-form" onSubmit={submit} noValidate aria-label={title}>
      <h3>{title}</h3>
      <div className="form-grid">{shown.map(f => (
        <label key={f.name} className={f.type === 'textarea' ? 'wide' : f.type === 'checkbox' ? 'check' : ''}>
          {f.type === 'checkbox' ? <><input data-field={f.name} type="checkbox" checked={v[f.name] === 'true'} onChange={e => setV({ ...v, [f.name]: e.target.checked ? 'true' : '' })} /> {f.label}</> : <>{f.label}{f.optional ? ' (optional)' : ''}
            {f.type === 'textarea' ? <textarea data-field={f.name} rows={3} value={v[f.name] ?? ''} onChange={e => setV({ ...v, [f.name]: e.target.value })} />
              : f.type === 'select' ? <select data-field={f.name} value={v[f.name] ?? ''} onChange={e => setV({ ...v, [f.name]: e.target.value })}><option value="">Select…</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : f.type === 'file' ? <input data-field={f.name} type="file" onChange={e => setFiles({ ...files, [f.name]: e.target.files?.[0] })} />
              : <input data-field={f.name} type={f.type || 'text'} step={f.step} autoComplete="off" value={v[f.name] ?? ''} onChange={e => setV({ ...v, [f.name]: e.target.value })} />}
            {f.hint && <small>{f.hint}</small>}</>}
        </label>))}
      </div>
      {err && <div className="alert" role="alert">{err}</div>}{ok && <div className="success" role="status">{ok}</div>}
      <div className="actions"><button className="btn primary" disabled={busy}>{busy ? <Spinner /> : submitLabel}</button>{onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}</div>
    </form>
  );
}

/** Generic list + create/edit/delete (with confirmation) panel. */
function Crud<T extends { id: string }>({ noun, queryKey, listPath, fields, toValues, toBody, createPath, updatePath, deletePath, invalidate = [], renderRow, canEdit = true, extra }: {
  noun: string; queryKey: unknown[]; listPath: string; fields: Field[]; toValues: (r: T) => Values; toBody: (v: Values, editing: boolean) => unknown;
  createPath: string; updatePath?: (id: string) => string; deletePath?: (id: string) => string; invalidate?: string[]; renderRow: (r: T) => ReactNode; canEdit?: boolean; extra?: Record<string, unknown>;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey, queryFn: () => api<T[]>(listPath) });
  const [editing, setEditing] = useState<T | null>(null);
  const [delErr, setDelErr] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey }); invalidate.forEach(k => qc.invalidateQueries({ queryKey: [k] })); };
  const del = useMutation({ mutationFn: (id: string) => api(deletePath!(id), { method: 'DELETE' }), onSuccess: () => { setDelErr(''); refresh(); }, onError: e => setDelErr(e instanceof Error ? e.message : 'Could not delete.') });
  return (
    <div className="stack">
      <RecordForm key={editing?.id ?? 'new'} title={editing ? `Edit ${noun}` : `Add ${noun}`} fields={fields} initial={editing ? toValues(editing) : undefined} submitLabel={editing ? 'Save changes' : `Add ${noun}`}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSubmit={async v => { if (editing) { await api(updatePath!(editing.id), { method: 'PATCH', body: JSON.stringify(toBody(v, true)) }); setEditing(null); } else await api(createPath, { method: 'POST', body: JSON.stringify({ ...(extra ?? {}), ...(toBody(v, false) as object) }) }); refresh(); }} />
      <section className="card"><h3>{noun[0].toUpperCase() + noun.slice(1)} records</h3>{delErr && <div className="alert" role="alert">{delErr}</div>}
        <QueryView q={q} empty={d => d.length === 0} emptyTitle={`No ${noun} records yet`}>{rows => (
          <ul className="list">{rows.map(r => (
            <li key={r.id}><span>{renderRow(r)}</span>
              <span className="row-actions">
                {canEdit && updatePath && <button className="btn sm" aria-label={`Edit ${noun}`} onClick={() => { setEditing(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil size={14} /> Edit</button>}
                {deletePath && <button className="btn sm danger" aria-label={`Delete ${noun}`} disabled={del.isPending} onClick={() => { if (window.confirm(`Delete this ${noun}? This cannot be undone.`)) del.mutate(r.id); }}><Trash2 size={14} /> Delete</button>}
              </span></li>))}
          </ul>)}</QueryView></section>
    </div>
  );
}

const useCourses = () => useQuery({ queryKey: ['courses'], queryFn: () => api<Course[]>('/courses') });
const courseOpts = (c?: Course[]): Opt[] => (c || []).map(x => ({ value: x.id, label: `${x.code} · ${x.title}` }));
const n = (s: string) => (s === '' ? undefined : Number(s));
type Student = { id: string; full_name: string; email: string; roll_number: string | null; program: string | null; department: string | null; semester: number | null };
type RosterRow = { student_id: string; profiles: { id: string; full_name: string; roll_number: string | null } | { id: string; full_name: string; roll_number: string | null }[] | null };
const prof = (r: RosterRow) => (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles);

function StudentsPanel() {
  const courses = useCourses();
  const students = useQuery({ queryKey: ['admin-students'], queryFn: () => api<Student[]>('/admin/students') });
  const qc = useQueryClient();
  return (
    <div className="stack">
      <Crud<Student> noun="student" queryKey={['admin-students']} listPath="/admin/students" createPath="/admin/students" updatePath={id => `/admin/students/${id}`} deletePath={id => `/admin/students/${id}`} invalidate={['courses']}
        fields={[{ name: 'roll_number', label: 'Roll number', only: 'create' }, { name: 'full_name', label: 'Full name' }, { name: 'email', label: 'Registered email', type: 'email', only: 'create' }, { name: 'password', label: 'Temporary password', type: 'password', hint: 'At least 12 characters', only: 'create' }, { name: 'program', label: 'Program', optional: true }, { name: 'department', label: 'Department', optional: true }, { name: 'semester', label: 'Semester', type: 'number', optional: true }]}
        toValues={s => ({ full_name: s.full_name, program: s.program ?? '', department: s.department ?? '', semester: s.semester?.toString() ?? '' })}
        toBody={(v, editing) => editing ? { full_name: v.full_name, program: v.program || null, department: v.department || null, semester: v.semester ? Number(v.semester) : null } : { roll_number: v.roll_number, full_name: v.full_name, email: v.email, password: v.password, program: v.program || undefined, department: v.department || undefined, semester: n(v.semester) }}
        renderRow={s => <><b>{s.roll_number}</b> · {s.full_name}<small>{s.email} · {s.program || 'No program'}{s.semester ? ` · Sem ${s.semester}` : ''}</small></>} />
      <RecordForm title="Enroll student in a course" submitLabel="Enroll" fields={[{ name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data) }, { name: 'student_id', label: 'Student', type: 'select', options: (students.data || []).map(s => ({ value: s.id, label: `${s.roll_number ?? '—'} · ${s.full_name}` })) }]}
        onSubmit={async v => { await api('/enrollments', { method: 'POST', body: JSON.stringify(v) }); qc.invalidateQueries({ queryKey: ['courses'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); }} />
    </div>
  );
}

function CoursesPanel() {
  const teachers = useQuery({ queryKey: ['admin-teachers'], queryFn: () => api<{ id: string; full_name: string }[]>('/admin/teachers') });
  return <Crud<Course> noun="course" queryKey={['courses']} listPath="/courses" createPath="/courses" updatePath={id => `/courses/${id}`} deletePath={id => `/courses/${id}`} invalidate={['dashboard', 'timetable']}
    fields={[{ name: 'code', label: 'Course code' }, { name: 'title', label: 'Title' }, { name: 'credit_hours', label: 'Credit hours', type: 'number', step: '0.5' }, { name: 'teacher_id', label: 'Instructor', type: 'select', options: (teachers.data || []).map(t => ({ value: t.id, label: t.full_name })), optional: true }, { name: 'semester', label: 'Semester', type: 'number', optional: true }, { name: 'program', label: 'Program', optional: true }, { name: 'description', label: 'Description', type: 'textarea', optional: true }]}
    toValues={c => ({ code: c.code, title: c.title, credit_hours: String(c.credit_hours), teacher_id: c.teacher_id ?? '', semester: c.semester?.toString() ?? '', program: c.program ?? '', description: c.description ?? '' })}
    toBody={v => ({ code: v.code, title: v.title, credit_hours: Number(v.credit_hours), teacher_id: v.teacher_id || null, semester: v.semester ? Number(v.semester) : null, program: v.program || null, description: v.description || undefined })}
    renderRow={c => <><b>{c.code}</b> · {c.title}<small>{c.credit_hours} credit hours{c.instructor ? ` · ${c.instructor}` : ''}</small></>} />;
}

function TimetablePanel() {
  const courses = useCourses();
  return <Crud<TSlot> noun="class slot" queryKey={['timetable']} listPath="/timetable" createPath="/timetable" updatePath={id => `/timetable/${id}`} deletePath={id => `/timetable/${id}`} invalidate={['dashboard']}
    fields={[{ name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data) }, { name: 'day_of_week', label: 'Day', type: 'select', options: DAYS.map((d, i) => ({ value: String(i), label: d })) }, { name: 'start_time', label: 'Start', type: 'time' }, { name: 'end_time', label: 'End', type: 'time' }, { name: 'room', label: 'Room', optional: true }]}
    toValues={s => ({ course_id: s.course_id, day_of_week: String(s.day_of_week), start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), room: s.room ?? '' })}
    toBody={v => ({ course_id: v.course_id, day_of_week: Number(v.day_of_week), start_time: v.start_time, end_time: v.end_time, room: v.room || null })}
    renderRow={s => <><b>{slotCourse(s)?.code}</b> · {DAYS[s.day_of_week]}<small>{hhmm(s.start_time)} – {hhmm(s.end_time)}{s.room ? ` · Room ${s.room}` : ''}</small></>} />;
}

function RosterPicker({ children }: { children: (courseId: string, roster: RosterRow[]) => ReactNode }) {
  const courses = useCourses(); const [cid, setCid] = useState('');
  const roster = useQuery({ queryKey: ['roster', cid], queryFn: () => api<RosterRow[]>(`/courses/${cid}/roster`), enabled: !!cid });
  return (
    <div className="stack">
      <section className="card"><label>Course<select value={cid} onChange={e => setCid(e.target.value)} aria-label="Course"><option value="">Select a course…</option>{courseOpts(courses.data).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label></section>
      {cid && <QueryView q={roster} empty={d => d.length === 0} emptyTitle="No students enrolled in this course">{d => children(cid, d)}</QueryView>}
    </div>
  );
}

function AttendancePanel() { return <RosterPicker>{(cid, roster) => <AttendanceSheet key={cid} cid={cid} roster={roster} />}</RosterPicker>; }
function AttendanceSheet({ cid, roster }: { cid: string; roster: RosterRow[] }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [edits, setEdits] = useState<Record<string, string>>({}); // statuses the user changed on screen
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const existing = useQuery({ queryKey: ['sheet', cid, date], queryFn: () => api<{ student_id: string; status: string }[]>(`/attendance/sheet?course_id=${cid}&date=${date}`), enabled: !!date });
  // Shown status = user edit, else the saved record for that date, else "present". Derived, so no effect/race.
  const saved = Object.fromEntries((existing.data ?? []).map(r => [r.student_id, r.status]));
  const statusOf = (id: string) => edits[id] ?? saved[id] ?? 'present';
  const m = useMutation({
    mutationFn: () => api<{ saved: number }>('/attendance', { method: 'POST', body: JSON.stringify({ course_id: cid, attended_on: date, records: roster.map(r => ({ student_id: r.student_id, status: statusOf(r.student_id) })) }) }),
    onSuccess: r => { setErr(''); setEdits({}); setMsg(`Saved ${r.saved} records for ${date}.`); qc.invalidateQueries({ queryKey: ['sheet', cid, date] }); qc.invalidateQueries({ queryKey: ['attendance'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: e => { setMsg(''); setErr(e instanceof Error ? e.message : 'Could not save.'); },
  });
  return (
    <section className="card"><h3>Mark attendance</h3>
      <label>Date<input type="date" value={date} max={today} onChange={e => { setDate(e.target.value); setEdits({}); setMsg(''); setErr(''); }} aria-label="Attendance date" /></label>
      {existing.data && existing.data.length > 0 && <p className="muted">Editing {existing.data.length} existing records for this date.</p>}
      <div className="table-wrap"><table><thead><tr><th>Roll no.</th><th>Student</th><th>Status</th></tr></thead><tbody>{roster.map(r => { const p = prof(r); return (
        <tr key={r.student_id}><td>{p?.roll_number || '—'}</td><td>{p?.full_name}</td><td><select disabled={existing.isFetching} aria-label={`Status for ${p?.full_name}`} value={statusOf(r.student_id)} onChange={e => setEdits({ ...edits, [r.student_id]: e.target.value })}>{['present', 'absent', 'late', 'leave'].map(s => <option key={s}>{s}</option>)}</select></td></tr>); })}</tbody></table></div>
      {err && <div className="alert" role="alert">{err}</div>}{msg && <div className="success" role="status">{msg}</div>}
      <div className="actions"><button className="btn primary" disabled={m.isPending || !date || existing.isFetching} onClick={() => m.mutate()}>{m.isPending ? <Spinner /> : 'Save attendance'}</button></div>
    </section>
  );
}

type Mark = { id: string; student_id: string; assessment: string; score: number; max_score: number; weightage: number | null; profiles: { full_name: string; roll_number: string | null } | { full_name: string; roll_number: string | null }[] | null };
function MarksPanel() {
  return <RosterPicker>{(cid, roster) => (
    <Crud<Mark> key={cid} noun="mark" queryKey={['marks-manage', cid]} listPath={`/results/manage?course_id=${cid}`} createPath="/results" updatePath={id => `/results/${id}`} deletePath={id => `/results/${id}`} invalidate={['results', 'dashboard', 'course']} extra={{ course_id: cid }}
      fields={[{ name: 'student_id', label: 'Student', type: 'select', only: 'create', options: roster.map(r => ({ value: r.student_id, label: `${prof(r)?.roll_number ?? '—'} · ${prof(r)?.full_name}` })) }, { name: 'assessment', label: 'Assessment (e.g. Midterm Exam)' }, { name: 'score', label: 'Obtained marks', type: 'number', step: '0.5' }, { name: 'max_score', label: 'Maximum marks', type: 'number', step: '0.5' }, { name: 'weightage', label: 'Weightage % of course', type: 'number', optional: true }, { name: 'feedback', label: 'Feedback', type: 'textarea', optional: true }]}
      toValues={m => ({ assessment: m.assessment, score: String(m.score), max_score: String(m.max_score), weightage: m.weightage?.toString() ?? '' })}
      toBody={(v, editing) => ({ ...(editing ? {} : { student_id: v.student_id }), assessment: v.assessment, score: Number(v.score), max_score: Number(v.max_score), weightage: v.weightage ? Number(v.weightage) : null, feedback: v.feedback || undefined })}
      renderRow={m => { const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles; return <><b>{p?.roll_number ?? '—'}</b> · {p?.full_name}<small>{m.assessment}: {m.score}/{m.max_score}{m.weightage != null ? ` · ${m.weightage}% weight` : ''}</small></>; }} />)}</RosterPicker>;
}

type Asg = { id: string; course_id: string; title: string; description?: string | null; due_at: string | null; max_marks: number; courses: { code: string } | { code: string }[] | null };
function AssignmentsPanel() {
  const courses = useCourses();
  return <Crud<Asg> noun="assignment" queryKey={['assignments-full']} listPath="/assignments" createPath="/assignments" updatePath={id => `/assignments/${id}`} deletePath={id => `/assignments/${id}`} invalidate={['assignments', 'dashboard', 'notifications']}
    fields={[{ name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data), only: 'create' }, { name: 'title', label: 'Title' }, { name: 'max_marks', label: 'Maximum marks', type: 'number' }, { name: 'due_at', label: 'Due date & time', type: 'datetime-local', optional: true }, { name: 'description', label: 'Instructions', type: 'textarea', optional: true }]}
    toValues={a => ({ title: a.title, max_marks: String(a.max_marks), due_at: a.due_at ? new Date(new Date(a.due_at).getTime() - new Date(a.due_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '', description: a.description ?? '' })}
    toBody={(v, editing) => ({ ...(editing ? {} : { course_id: v.course_id }), title: v.title, max_marks: Number(v.max_marks), due_at: v.due_at ? new Date(v.due_at).toISOString() : undefined, description: v.description || undefined })}
    renderRow={a => { const c = Array.isArray(a.courses) ? a.courses[0] : a.courses; return <><b>{c?.code}</b> · {a.title}<small>Due {fmtDate(a.due_at)} · {a.max_marks} marks</small></>; }} />;
}

type Ann = { id: string; title: string; body: string; course_id: string | null; is_global: boolean; created_at: string };
function AnnouncementsPanel() {
  const courses = useCourses();
  return <Crud<Ann> noun="announcement" queryKey={['announcements-manage']} listPath="/announcements" createPath="/announcements" updatePath={id => `/announcements/${id}`} deletePath={id => `/announcements/${id}`} invalidate={['notifications', 'dashboard']}
    fields={[{ name: 'title', label: 'Title' }, { name: 'body', label: 'Message', type: 'textarea' }, { name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data), optional: true }, { name: 'is_global', label: 'Send to the whole campus', type: 'checkbox' }]}
    toValues={a => ({ title: a.title, body: a.body, course_id: a.course_id ?? '', is_global: a.is_global ? 'true' : '' })}
    toBody={v => ({ title: v.title, body: v.body, course_id: v.course_id || null, is_global: v.is_global === 'true' })}
    renderRow={a => <><b>{a.title}</b><small>{a.is_global ? 'Campus-wide' : 'Course'} · {fmtDate(a.created_at)}</small></>} />;
}

type Material = { id: string; title: string; file_name: string; courses: { code: string } | { code: string }[] | null };
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
function MaterialsPanel() {
  const courses = useCourses(); const qc = useQueryClient();
  const list = useQuery({ queryKey: ['resources-manage'], queryFn: () => api<Material[]>('/resources') });
  const del = useMutation({ mutationFn: (id: string) => api(`/materials/${id}`, { method: 'DELETE' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['resources-manage'] }); qc.invalidateQueries({ queryKey: ['resources'] }); } });
  return (
    <div className="stack">
      <RecordForm title="Upload course material" submitLabel="Upload" fields={[{ name: 'course_id', label: 'Course', type: 'select', options: courseOpts(courses.data) }, { name: 'title', label: 'Title' }, { name: 'file', label: 'File (PDF, Word, PowerPoint, image or text; max 10 MB)', type: 'file' }, { name: 'description', label: 'Description', optional: true }]}
        onSubmit={async (v, files) => { const f = files.file!; if (f.size > 10 * 1048576) throw new Error('File must be 10 MB or smaller.'); await api('/materials', { method: 'POST', body: JSON.stringify({ course_id: v.course_id, title: v.title, description: v.description || undefined, file_name: f.name, mime_type: f.type || 'text/plain', content_base64: await toBase64(f) }) }); qc.invalidateQueries({ queryKey: ['resources-manage'] }); qc.invalidateQueries({ queryKey: ['resources'] }); }} />
      <section className="card"><h3>Materials</h3>
        <QueryView q={list} empty={d => d.length === 0} emptyTitle="No materials yet">{rows => <ul className="list">{rows.map(r => <li key={r.id}><span><b>{(Array.isArray(r.courses) ? r.courses[0] : r.courses)?.code}</b> · {r.title}<small>{r.file_name}</small></span>
          <button className="btn sm danger" aria-label="Delete material" onClick={() => { if (window.confirm('Delete this material? This cannot be undone.')) del.mutate(r.id); }}><Trash2 size={14} /> Delete</button></li>)}</ul>}</QueryView></section>
    </div>
  );
}

const TABS = [
  { key: 'students', label: 'Students', roles: ['admin'], el: <StudentsPanel /> },
  { key: 'courses', label: 'Courses', roles: ['admin'], el: <CoursesPanel /> },
  { key: 'timetable', label: 'Timetable', roles: ['admin'], el: <TimetablePanel /> },
  { key: 'attendance', label: 'Attendance', roles: ['admin', 'teacher'], el: <AttendancePanel /> },
  { key: 'marks', label: 'Marks', roles: ['admin', 'teacher'], el: <MarksPanel /> },
  { key: 'assignments', label: 'Assignments', roles: ['admin', 'teacher'], el: <AssignmentsPanel /> },
  { key: 'announcements', label: 'Announcements', roles: ['admin', 'teacher'], el: <AnnouncementsPanel /> },
  { key: 'materials', label: 'Materials', roles: ['admin', 'teacher'], el: <MaterialsPanel /> },
];

export function Admin() {
  const { profile } = useAuth();
  const tabs = TABS.filter(t => profile && t.roles.includes(profile.role));
  const [key, setKey] = useState(tabs[0]?.key);
  return (
    <>
      <PageHeader eyebrow={profile?.role === 'admin' ? 'Administration' : 'Teaching'} title="Management console" sub="All changes are saved to the database and appear in the student portal." />
      <div className="tabs" role="tablist" aria-label="Management sections">{tabs.map(t => <button key={t.key} role="tab" aria-selected={key === t.key} className={key === t.key ? 'on' : ''} onClick={() => setKey(t.key)}>{t.label}</button>)}</div>
      {tabs.find(t => t.key === key)?.el}
    </>
  );
}
