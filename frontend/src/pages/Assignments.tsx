import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeader, QueryView, Spinner, fmtDate } from '../components/ui';

type Asg = { id: string; title: string; description?: string | null; due_at: string | null; max_marks: number; courses: { code: string; title: string } | { code: string; title: string }[] | null };
type Sub = { id: string; assignment_id: string; submitted_at: string; marks_awarded: number | null; feedback?: string | null };
const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);

export function Assignments() {
  const { profile } = useAuth();
  const isStudent = profile?.role === 'student';
  const asg = useQuery({ queryKey: ['assignments-full'], queryFn: () => api<Asg[]>('/assignments') });
  const subs = useQuery({ queryKey: ['submissions'], queryFn: () => api<Sub[]>('/submissions'), enabled: isStudent });
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: (assignment_id: string) => api('/submissions', { method: 'POST', body: JSON.stringify({ assignment_id, text_response: text }) }),
    onSuccess: () => { setOpenId(null); setText(''); setErr(''); qc.invalidateQueries({ queryKey: ['submissions'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); },
    onError: e => setErr(e instanceof Error ? e.message : 'Submission failed.'),
  });
  return (
    <>
      <PageHeader eyebrow="Coursework" title="Assignments" sub="Due dates, submission status and grades." />
      <QueryView q={asg} empty={d => d.length === 0} emptyTitle="No assignments">{d => (
        <div className="stack">{d.map(a => {
          const s = subs.data?.find(x => x.assignment_id === a.id);
          const overdue = a.due_at && new Date(a.due_at) < new Date() && !s;
          const c = one(a.courses);
          return (
            <section className="card" key={a.id}>
              <div className="split"><div><span className="chip">{c?.code}</span><h3>{a.title}</h3></div>
                {isStudent && <span className={`pill ${s ? 'present' : overdue ? 'absent' : 'late'}`}>{s ? (s.marks_awarded !== null ? 'Graded' : 'Submitted') : overdue ? 'Overdue' : 'Pending'}</span>}</div>
              {a.description && <p className="muted">{a.description}</p>}
              <small>Due {fmtDate(a.due_at)} · {a.max_marks} marks{s?.marks_awarded != null ? ` · Scored ${s.marks_awarded}/${a.max_marks}` : ''}</small>
              {s?.feedback && <p className="note">Feedback: {s.feedback}</p>}
              {isStudent && !s && openId !== a.id && <div><button className="btn sm" onClick={() => { setOpenId(a.id); setErr(''); }}>Submit work</button></div>}
              {openId === a.id && (
                <form onSubmit={e => { e.preventDefault(); if (!text.trim()) { setErr('Write your response first.'); return; } submit.mutate(a.id); }}>
                  <textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="Type your response…" />
                  {err && <div className="alert" role="alert">{err}</div>}
                  <div className="actions"><button className="btn primary sm" disabled={submit.isPending}>{submit.isPending ? <Spinner /> : 'Submit'}</button><button type="button" className="btn sm" onClick={() => setOpenId(null)}>Cancel</button></div>
                </form>)}
            </section>);
        })}</div>)}
      </QueryView>
    </>
  );
}
