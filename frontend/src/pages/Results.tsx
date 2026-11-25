import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PageHeader, QueryView, fmtDate } from '../components/ui';

type Mark = { id: string; score: number; max_score: number; feedback?: string | null; assessment?: string | null; created_at: string; courses: { id: string; code: string; title: string } | { id: string; code: string; title: string }[] | null; assignments: { title: string } | { title: string }[] | null };
const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);

export function Results() {
  const q = useQuery({ queryKey: ['results'], queryFn: () => api<Mark[]>('/results') });
  return (
    <>
      <PageHeader eyebrow="Academics" title="Marks & results" sub="Assessment scores published by your instructors." />
      <QueryView q={q} empty={d => d.length === 0} emptyTitle="No results published yet">{d => {
        const groups = new Map<string, { title: string; rows: Mark[] }>();
        for (const m of d) { const c = one(m.courses); const k = c?.id ?? 'x'; if (!groups.has(k)) groups.set(k, { title: c ? `${c.code} · ${c.title}` : 'Course', rows: [] }); groups.get(k)!.rows.push(m); }
        return <div className="stack">{[...groups.values()].map(g => {
          const got = g.rows.reduce((n, r) => n + Number(r.score), 0), max = g.rows.reduce((n, r) => n + Number(r.max_score), 0);
          return (
            <section className="card" key={g.title}>
              <div className="split"><h3>{g.title}</h3><span className="chip">{got}/{max} · {max ? Math.round(got / max * 100) : 0}%</span></div>
              <div className="table-wrap"><table><thead><tr><th>Assessment</th><th>Score</th><th>Date</th></tr></thead>
                <tbody>{g.rows.map(r => <tr key={r.id}><td>{r.assessment || one(r.assignments)?.title || 'Assessment'}{r.feedback && <small className="block">{r.feedback}</small>}</td><td>{r.score}/{r.max_score}</td><td>{fmtDate(r.created_at)}</td></tr>)}</tbody></table></div>
            </section>);
        })}</div>;
      }}</QueryView>
    </>
  );
}
