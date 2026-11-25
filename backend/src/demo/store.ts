import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildSeed } from './seedData.js';

export type Row = Record<string, any>;
type AuthUser = { id: string; email: string; hash: string; meta: Record<string, unknown> };
type Data = { secret: string; tables: Record<string, Row[]>; auth: AuthUser[]; refresh: Record<string, string> };

export const TABLES = ['profiles', 'courses', 'course_enrollments', 'resources', 'assignments', 'submissions', 'quizzes', 'questions', 'quiz_attempts', 'marks', 'announcements', 'announcement_reads', 'chat_messages', 'complaints', 'timetable_slots', 'attendance'];
const hashPw = (pw: string) => { const salt = randomBytes(12).toString('hex'); return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`; };
const checkPw = (pw: string, stored: string) => { const [salt, h] = stored.split(':'); const a = Buffer.from(h, 'hex'), b = scryptSync(pw, salt, 32); return a.length === b.length && timingSafeEqual(a, b); };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export class Store {
  data: Data;
  private timer: NodeJS.Timeout | null = null;
  readonly filesDir: string;
  constructor(public readonly dir: string) {
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
    this.filesDir = path.join(dir, 'files');
    this.file = path.join(dir, 'db.json');
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : this.empty();
    for (const t of TABLES) this.data.tables[t] ??= [];
    if (!this.data.tables.profiles.length) this.seed();
  }
  private file: string;
  private empty(): Data { return { secret: randomBytes(32).toString('hex'), tables: {}, auth: [], refresh: {} }; }
  save() { if (this.timer) return; this.timer = setTimeout(() => { this.timer = null; fs.writeFileSync(this.file, JSON.stringify(this.data)); }, 150); }
  flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } fs.writeFileSync(this.file, JSON.stringify(this.data)); }

  /** Idempotent: upserts by stable id; never removes rows that are not part of the seed. */
  seed(now = new Date()) {
    const s = buildSeed(now);
    const up = (t: string, row: Row) => { const rows = this.data.tables[t]; const i = rows.findIndex(r => r.id === row.id); const full = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(i >= 0 ? rows[i] : {}), ...row }; if (i >= 0) rows[i] = full; else rows.push(full); };
    for (const u of s.users) {
      if (!this.data.auth.some(a => a.id === u.id)) this.data.auth.push({ id: u.id, email: u.email, hash: hashPw(u.password), meta: { full_name: u.full_name } });
      up('profiles', { id: u.id, email: u.email, full_name: u.full_name, role: u.role, roll_number: u.roll_number ?? null, program: u.program ?? null, department: u.department ?? null, semester: u.semester ?? null, avatar_url: null });
    }
    for (const [t, rows] of Object.entries(s.tables)) for (const r of rows) up(t, r as Row);
    for (const [p, text] of Object.entries(s.files)) { const f = path.join(this.filesDir, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
    this.flush();
    return { users: s.users.length, ...Object.fromEntries(Object.entries(s.tables).map(([k, v]) => [k, v.length])) };
  }
  /** Demo reset: wipes the demo database file and reseeds. Only ever touches this demo store, never Supabase. */
  reset(now = new Date()) {
    this.data = this.empty(); for (const t of TABLES) this.data.tables[t] = [];
    fs.rmSync(this.filesDir, { recursive: true, force: true }); fs.mkdirSync(this.filesDir, { recursive: true });
    return this.seed(now);
  }

  // ---- auth ----
  signJwt(payload: Record<string, unknown>, ttl = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: 'HS256', typ: 'JWT' }), body = b64({ aud: 'authenticated', role: 'authenticated', iat: now, exp: now + ttl, ...payload });
    return `${head}.${body}.${createHmac('sha256', this.data.secret).update(`${head}.${body}`).digest('base64url')}`;
  }
  verifyJwt(token: string): Record<string, any> | null {
    const [h, b, s] = token.split('.'); if (!h || !b || !s) return null;
    if (createHmac('sha256', this.data.secret).update(`${h}.${b}`).digest('base64url') !== s) return null;
    try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; }
  }
  session(u: AuthUser) {
    const access_token = this.signJwt({ sub: u.id, email: u.email }), refresh_token = randomBytes(24).toString('hex');
    this.data.refresh[refresh_token] = u.id; this.save();
    return { access_token, refresh_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated' } };
  }
  signIn(email: string, password: string) { const u = this.data.auth.find(a => a.email.toLowerCase() === email.toLowerCase()); return u && checkPw(password, u.hash) ? this.session(u) : null; }
  userFromToken(token: string) { const p = this.verifyJwt(token); return p?.sub && !p.recovery_only ? this.data.auth.find(a => a.id === p.sub) ?? null : null; }
  refreshSession(rt: string) { const id = this.data.refresh[rt]; const u = id && this.data.auth.find(a => a.id === id); if (!u) return null; delete this.data.refresh[rt]; return this.session(u); }
  setPassword(id: string, pw: string) { const u = this.data.auth.find(a => a.id === id); if (!u) return false; u.hash = hashPw(pw); this.save(); return true; }
  createUser(email: string, password: string, meta: Record<string, unknown>) {
    if (this.data.auth.some(a => a.email.toLowerCase() === email.toLowerCase())) return null;
    const u: AuthUser = { id: randomUUID(), email: email.toLowerCase(), hash: hashPw(password), meta };
    this.data.auth.push(u);
    // mirrors the on_auth_user_created trigger
    this.data.tables.profiles.push({ id: u.id, email: u.email, full_name: String(meta.full_name ?? ''), role: 'student', roll_number: null, program: null, department: null, semester: null, avatar_url: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    this.save(); return u;
  }
  deleteUser(id: string) { this.data.auth = this.data.auth.filter(a => a.id !== id); this.data.tables.profiles = this.data.tables.profiles.filter(p => p.id !== id); this.save(); }
}
