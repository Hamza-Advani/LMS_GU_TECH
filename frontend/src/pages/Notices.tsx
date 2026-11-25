import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PageHeader, QueryView, fmtDate } from '../components/ui';

export type Notifications = {
  announcements: { id: string; title: string; body: string; created_at: string; read: boolean }[];
  deadlines: { id: string; title: string; due_at: string; courses: { code: string } | { code: string }[] | null }[];
};
const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);

export function Notices() {
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notifications>('/notifications') });
  const qc = useQueryClient();
  const read = useMutation({ mutationFn: (id: string) => api(`/announcements/${id}/read`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return (
    <>
      <PageHeader eyebrow="Updates" title="Notifications" sub="Announcements and upcoming deadlines." />
      <QueryView q={q}>{d => (
        <div className="stack">
          {d.deadlines.length > 0 && <section className="card"><h3>Upcoming deadlines</h3>
            <ul className="list">{d.deadlines.map(a => <li key={a.id}><b>{fmtDate(a.due_at)}</b><span>{a.title}<small>{one(a.courses)?.code}</small></span></li>)}</ul></section>}
          <section className="card"><h3>Announcements</h3>
            {d.announcements.length === 0 ? <p className="muted">No announcements yet.</p> : (
              <ul className="list">{d.announcements.map(a => (
                <li key={a.id} className={a.read ? '' : 'unread'}>
                  <span><b>{a.title}</b>{!a.read && <i className="dot" aria-label="Unread" />}<small className="block">{a.body}</small><small>{fmtDate(a.created_at)}</small></span>
                  {!a.read && <button className="btn sm" onClick={() => read.mutate(a.id)} disabled={read.isPending}>Mark read</button>}
                </li>))}
              </ul>)}
          </section>
        </div>)}
      </QueryView>
    </>
  );
}
