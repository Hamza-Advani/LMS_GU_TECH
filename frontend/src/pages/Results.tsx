import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PageHeader, QueryView, fmtDate } from '../components/ui';

type R = {
  gpa: number | null; gradingNote: string;
  courses: { course: { id: string; code: string; title: string; credit_hours: number }; items: { id: string; assessment: string; score: number; max_score: number; weightage: number | null; feedback?: string | null; created_at: string }[];
    result: { rawObtained: number; rawTotal: number; weighted: boolean; weightedObtained: number | null; weightedTotal: number | null; percentage: number | null; grade: string | null } }[];
};

export function Results() {
  const q = useQuery({ queryKey: ['results'], queryFn: () => api<R>('/results') });
  return (
    <>
      <PageHeader eyebrow="Academics" title="Marks & results" sub="Assessment scores published by your instructors." />
      <QueryView q={q} empty={d => d.courses.length === 0} emptyTitle="No results published yet">{d => (
        <div className="stack">
          <section className="card overall"><strong>{d.gpa ?? '—'}</strong><span>Semester GPA (credit-weighted)<small>{d.gradingNote}</small></span></section>
          {d.courses.map(c => (
            <section className="card" key={c.course.id}>
              <div className="split"><h3>{c.course.code} · {c.course.title}</h3>
                <span className="chip grade-chip">{c.result.percentage === null ? '—' : `${c.result.percentage}%`}{c.result.grade ? ` · ${c.result.grade}` : ''}</span></div>
              <small>{c.result.rawObtained}/{c.result.rawTotal} marks obtained{c.result.weighted ? ` · weighted ${c.result.weightedObtained}/${c.result.weightedTotal}` : ''} · {c.course.credit_hours} credit hours</small>
              <div className="table-wrap"><table><thead><tr><th>Assessment</th><th>Obtained</th><th>Weight</th><th>Date</th></tr></thead>
                <tbody>{c.items.map(r => <tr key={r.id}><td>{r.assessment}{r.feedback && <small className="block">{r.feedback}</small>}</td><td>{r.score}/{r.max_score}</td><td>{r.weightage != null ? `${r.weightage}%` : '—'}</td><td>{fmtDate(r.created_at)}</td></tr>)}</tbody></table></div>
            </section>))}
        </div>)}
      </QueryView>
    </>
  );
}
