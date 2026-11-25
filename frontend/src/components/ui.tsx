import { useState, type ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { BRAND } from '../lib/brand';

export function Logo({ size = 40 }: { size?: number }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <span className="logo-fallback" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-label={BRAND.short}>GU</span>
    : <img src={BRAND.logo} alt={`${BRAND.short} logo`} width={size} height={size} onError={() => setFailed(true)} className="logo-img" />;
}
export const Spinner = ({ label = 'Loading' }: { label?: string }) => <span className="spinner" role="status" aria-label={label} />;
export const Skeleton = ({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) => <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="card" aria-busy="true" aria-label="Loading content"><Skeleton h={14} w="40%" />{Array.from({ length: rows }, (_, i) => <div key={i} style={{ marginTop: 14 }}><Skeleton h={12} w={`${90 - i * 12}%`} /></div>)}</div>;
}
export function PageSkeleton() {
  return <div className="stack" aria-busy="true"><Skeleton h={34} w="55%" /><div className="grid4"><CardSkeleton rows={1} /><CardSkeleton rows={1} /><CardSkeleton rows={1} /><CardSkeleton rows={1} /></div><CardSkeleton rows={4} /></div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="state error" role="alert"><AlertTriangle size={26} /><h3>Something went wrong</h3><p>{message}</p>{onRetry && <button className="btn" onClick={onRetry}><RefreshCw size={15} /> Try again</button>}</div>;
}
export function EmptyState({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return <div className="state"><Inbox size={26} /><h3>{title}</h3>{text && <p>{text}</p>}{children}</div>;
}
export function PageHeader({ eyebrow, title, sub, action }: { eyebrow?: string; title: string; sub?: string; action?: ReactNode }) {
  return <div className="page-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>{action}</div>;
}
/** Renders loading / error / empty / content for a react-query result. Errors surface with retry, so there is never an infinite loader. */
export function QueryView<T>({ q, empty, skeleton, emptyTitle, children }: { q: { data?: T; isLoading: boolean; error: unknown; refetch: () => unknown }; empty?: (d: T) => boolean; skeleton?: ReactNode; emptyTitle?: string; children: (d: T) => ReactNode }) {
  if (q.isLoading) return <>{skeleton ?? <CardSkeleton rows={4} />}</>;
  if (q.error || q.data === undefined) return <ErrorState message={q.error instanceof Error ? q.error.message : 'Could not load this page.'} onRetry={() => q.refetch()} />;
  if (empty?.(q.data)) return <EmptyState title={emptyTitle ?? 'Nothing here yet'} text="Records will appear here once they are added." />;
  return <>{children(q.data)}</>;
}
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const hhmm = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
export const fmtDate = (v?: string | null) => v ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(v)) : '—';
