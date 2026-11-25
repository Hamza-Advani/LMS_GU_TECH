import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, User, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { BRAND } from '../lib/brand';
import { Logo, Spinner } from '../components/ui';
import { useMeta } from '../lib/meta';

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><Logo size={64} /><div><b>{BRAND.name}</b><span>{BRAND.school}</span></div></div>
        {children}
        <p className="auth-foot"><ShieldCheck size={14} /> Secure access for GU Tech students and staff</p>
      </section>
    </main>
  );
}

export function Login() {
  const { session, signIn } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from || '/';
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const meta = useMeta().data;
  if (session) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!id.trim() || !pw) { setErr('Enter your roll number and password.'); return; }
    setBusy(true); setErr('');
    try { await signIn(id.trim(), pw); nav(from, { replace: true }); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  }
  return (
    <AuthFrame>
      <span className="eyebrow">Student Portal</span>
      <h1>Welcome back</h1>
      <p className="muted">Sign in with your roll number to see your courses, timetable and results.</p>
      <form onSubmit={submit} noValidate>
        <label>Roll number
          <div className="field"><User size={16} /><input value={id} onChange={e => setId(e.target.value)} autoComplete="username" autoCapitalize="characters" placeholder="e.g. 2023-BSCS-001" aria-invalid={!!err} /></div>
        </label>
        <label>Password
          <div className="field"><LockKeyhole size={16} />
            <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" placeholder="Enter your password" aria-invalid={!!err} />
            <button type="button" className="icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </label>
        <div className="row-end"><Link to="/forgot-password">Forgot password?</Link></div>
        {err && <div className="alert" role="alert">{err}</div>}
        <button className="btn primary full" disabled={busy}>{busy ? <><Spinner label="Signing in" /> Signing in…</> : <>Sign In <ArrowRight size={16} /></>}</button>
      </form>
      {meta?.demo && meta.demoAccounts && (
        <aside className="demo-box" aria-label="Demo accounts"><b>DEMO MODE: sample data only</b>
          <p>Student: <button type="button" className="link" onClick={() => { setId(meta.demoAccounts!.student.roll); setPw(meta.demoAccounts!.student.password); }}>use demo student</button> <code>{meta.demoAccounts.student.roll}</code></p>
          <p>Admin: <button type="button" className="link" onClick={() => { setId(meta.demoAccounts!.admin.email); setPw(meta.demoAccounts!.admin.password); }}>use demo admin</button> <code>{meta.demoAccounts.admin.email}</code></p>
        </aside>)}
    </AuthFrame>
  );
}

export function ForgotPassword() {
  const [id, setId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!id.trim()) { setErr('Enter your roll number.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api<{ message: string }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ identifier: id.trim(), redirectTo: `${location.origin}/reset-password` }) }, { auth: false });
      setMsg(r.message);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Request failed.'); }
    finally { setBusy(false); }
  }
  return (
    <AuthFrame>
      <span className="eyebrow">Account recovery</span>
      <h1>Reset your password</h1>
      <p className="muted">Enter your roll number. We’ll email a reset link to the address registered with your account.</p>
      {msg ? <div className="success" role="status">{msg}</div> : (
        <form onSubmit={submit} noValidate>
          <label>Roll number<div className="field"><User size={16} /><input value={id} onChange={e => setId(e.target.value)} autoComplete="username" /></div></label>
          {err && <div className="alert" role="alert">{err}</div>}
          <button className="btn primary full" disabled={busy}>{busy ? <><Spinner /> Sending…</> : 'Send reset link'}</button>
        </form>
      )}
      <div className="row-end" style={{ justifyContent: 'center', marginTop: 16 }}><Link to="/login">← Back to sign in</Link></div>
    </AuthFrame>
  );
}

export function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((ev, s) => { if (ev === 'PASSWORD_RECOVERY' || s) setReady(true); });
    return () => subscription.unsubscribe();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 12) { setErr('Use at least 12 characters.'); return; }
    if (pw !== pw2) { setErr('The passwords do not match.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr(error.message); else setDone(true);
  }
  return (
    <AuthFrame>
      <span className="eyebrow">Account recovery</span>
      <h1>Choose a new password</h1>
      {done ? <div className="success" role="status">Password updated. <Link to="/">Continue to your portal</Link></div>
        : !ready ? <div className="alert" role="alert">This reset link is invalid or has expired. <Link to="/forgot-password">Request a new one</Link>.</div>
        : <form onSubmit={submit} noValidate>
            <label>New password<div className="field"><LockKeyhole size={16} /><input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" /></div></label>
            <label>Confirm password<div className="field"><LockKeyhole size={16} /><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" /></div></label>
            {err && <div className="alert" role="alert">{err}</div>}
            <button className="btn primary full" disabled={busy}>{busy ? <><Spinner /> Saving…</> : 'Update password'}</button>
          </form>}
    </AuthFrame>
  );
}
