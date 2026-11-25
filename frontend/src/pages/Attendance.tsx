import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PageHeader, QueryView, fmtDate } from '../components/ui';

type Att = {
  overall: { percentage: number | null; attended: number; total: number };
  courses: { id: string; code: string; title: string; total: number; attended: number; percentage: number | null }[];
  history: { id: string; course_id: string; attended_on: string; status: string }[];
};
const LOW = 75;

export function Attendance() {
  const q = useQuery({ queryKey: ['attendance'], queryFn: () => api<Att>('/attendance') });
  return (
    <>
      <PageHeader eyebrow="Academics" title="Attendance" sub={`Attendance below ${LOW}% may affect exam eligibility.`} />
      <QueryView q={q}>{d => {
        const name = (id: string) => d.courses.find(c => c.id === id)?.code ?? '';
        const o = d.overall.percentage;
        return (
          <>
            <section className="card overall">
              <strong className={o !== null && o < LOW ? 'bad' : ''}>{o === null ? '—' : `${o}%`}</strong>
              <span>Overall attendance<small>{d.overall.total ? `${d.overall.attended} of ${d.overall.total} classes attended` : 'No attendance has been recorded yet'}</small></span>
            </section>
            <div className="grid3">{d.courses.map(c => (
              <section key={c.id} className="card">
                <span className="chip">{c.code}</span><h3>{c.title}</h3>
                <div className="bar" role="img" aria-label={`${c.percentage ?? 0}% attendance`}><i className={c.percentage !== null && c.percentage < LOW ? 'low' : ''} style={{ width: `${c.percentage ?? 0}%` }} /></div>
                <small>{c.percentage === null ? 'No records yet' : `${c.percentage}% · ${c.attended}/${c.total} classes`}</small>
              </section>))}
            </div>
            <section className="card"><h3>History</h3>
              {d.history.length === 0 ? <p className="muted">No records yet.</p> : (
                <div className="table-wrap"><table><thead><tr><th>Date</th><th>Course</th><th>Status</th></tr></thead>
                  <tbody>{d.history.map(h => <tr key={h.id}><td>{fmtDate(h.attended_on)}</td><td>{name(h.course_id)}</td><td><span className={`pill ${h.status}`}>{h.status}</span></td></tr>)}</tbody></table></div>)}
            </section>
          </>);
      }}</QueryView>
    </>
  );
}
