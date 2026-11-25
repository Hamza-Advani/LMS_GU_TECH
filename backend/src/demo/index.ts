import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Router, json } from 'express';
import { Store } from './store.js';
import { createFakeClient } from './fakeSupabase.js';

export const DEMO = process.env.DEMO_MODE === 'true';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const demoDir = process.env.DEMO_DATA_DIR ? path.resolve(process.env.DEMO_DATA_DIR) : path.join(root, '.demo-data');
let store: Store | null = null;
export const getStore = () => (store ??= new Store(demoDir));
const publicBase = () => process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;

export const demoAdminClient = () => createFakeClient(getStore(), null, publicBase()) as any;
export const demoAuthClient = demoAdminClient;
export function demoScopedClient(token: string) {
  const s = getStore(), u = s.userFromToken(token);
  const prof = u && s.data.tables.profiles.find(p => p.id === u.id);
  return createFakeClient(s, prof ? { id: prof.id, role: prof.role } : { id: '00000000-0000-4000-8000-000000000000', role: 'anon' }, publicBase()) as any;
}

/** GoTrue-compatible endpoints so the browser's supabase-js talks to the demo backend. Mounted at /auth/v1 in demo mode only. */
export function demoAuthRouter() {
  const r = Router(); const s = getStore();
  r.use(json());
  const bearer = (h?: string) => h?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const userJson = (u: { id: string; email: string }) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {} });
  r.get('/user', (req, res) => { const u = s.userFromToken(bearer(req.headers.authorization)); u ? res.json(userJson(u)) : res.status(401).json({ msg: 'invalid JWT' }); });
  r.put('/user', (req, res) => {
    const u = s.userFromToken(bearer(req.headers.authorization)); if (!u) return res.status(401).json({ msg: 'invalid JWT' });
    const pw = req.body?.password; if (typeof pw !== 'string' || pw.length < 12) return res.status(422).json({ msg: 'Password should be at least 12 characters.' });
    s.setPassword(u.id, pw); res.json(userJson(u));
  });
  r.post('/logout', (req, res) => { res.status(204).end(); });
  r.post('/token', (req, res) => {
    if (req.query.grant_type !== 'refresh_token') return res.status(400).json({ error: 'unsupported_grant_type' });
    const sess = s.refreshSession(String(req.body?.refresh_token ?? '')); sess ? res.json(sess) : res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
  });
  r.get('/settings', (_req, res) => res.json({ external: {}, disable_signup: true, mailer_autoconfirm: true }));
  return r;
}

export function demoMiscRouter() {
  const r = Router(); const s = getStore();
  r.get('/demo/files', (req, res) => {
    const p = s.verifyJwt(String(req.query.token ?? '')); const file = typeof p?.file === 'string' ? p.file.split('/').slice(1).join('/') : '';
    const full = path.join(s.filesDir, file);
    if (!file || !full.startsWith(s.filesDir) || !fs.existsSync(full)) return res.status(404).json({ message: 'File not found or link expired.' });
    res.download(full, typeof p?.dl === 'string' ? p.dl : path.basename(full));
  });
  return r;
}
