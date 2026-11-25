/**
 * DEMO MODE ONLY. A small in-process stand-in for the subset of supabase-js that this API uses, backed by a local JSON store.
 * It mirrors the RLS rules of database/schema.sql + migrations so the app behaves the same, but it is NOT Supabase and
 * proves nothing about the real database or its policies.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Row, Store } from './store.js';

type Me = { id: string; role: string } | null; // null = service role (bypasses RLS)
type Err = { code?: string; message: string };
const err = (message: string, code?: string): Err => ({ message, code });

// ---------- relations used in select() embeds ----------
const REL: Record<string, Record<string, { target: string; fk: string; many?: boolean }>> = {
  courses: { course_enrollments: { target: 'course_enrollments', fk: 'course_id', many: true } },
  course_enrollments: { profiles: { target: 'profiles', fk: 'student_id' }, courses: { target: 'courses', fk: 'course_id' } },
  resources: { courses: { target: 'courses', fk: 'course_id' } },
  assignments: { courses: { target: 'courses', fk: 'course_id' } },
  quizzes: { courses: { target: 'courses', fk: 'course_id' } },
  timetable_slots: { courses: { target: 'courses', fk: 'course_id' } },
  attendance: { courses: { target: 'courses', fk: 'course_id' } },
  marks: { courses: { target: 'courses', fk: 'course_id' }, profiles: { target: 'profiles', fk: 'student_id' }, assignments: { target: 'assignments', fk: 'assignment_id' } },
  submissions: { profiles: { target: 'profiles', fk: 'student_id' }, assignments: { target: 'assignments', fk: 'assignment_id' } },
  chat_messages: { profiles: { target: 'profiles', fk: 'sender_id' } },
  complaints: { profiles: { target: 'profiles', fk: 'student_id' } },
};
const FK: Record<string, string> = { course_id: 'courses', student_id: 'profiles', teacher_id: 'profiles', assignment_id: 'assignments', created_by: 'profiles', entered_by: 'profiles' };
const REQUIRED: Record<string, string[]> = {
  courses: ['title', 'code'], assignments: ['course_id', 'title', 'max_marks'], timetable_slots: ['course_id', 'day_of_week', 'start_time', 'end_time'],
  attendance: ['course_id', 'student_id', 'attended_on', 'status'], marks: ['student_id', 'course_id', 'score', 'max_score'], announcements: ['title', 'body'],
  resources: ['course_id', 'title', 'file_path', 'file_name'], submissions: ['assignment_id', 'student_id'], course_enrollments: ['course_id', 'student_id'],
};
const UNIQUE: Record<string, string[][]> = {
  courses: [['code']], course_enrollments: [['course_id', 'student_id']], submissions: [['assignment_id', 'student_id']], attendance: [['course_id', 'student_id', 'attended_on']],
  timetable_slots: [['course_id', 'day_of_week', 'start_time']], profiles: [['email']], announcement_reads: [['announcement_id', 'user_id']],
};
const CASCADE: Record<string, [string, string][]> = {
  courses: [['course_enrollments', 'course_id'], ['resources', 'course_id'], ['assignments', 'course_id'], ['quizzes', 'course_id'], ['marks', 'course_id'], ['announcements', 'course_id'], ['chat_messages', 'course_id'], ['timetable_slots', 'course_id'], ['attendance', 'course_id']],
  assignments: [['submissions', 'assignment_id']],
  profiles: [['course_enrollments', 'student_id'], ['attendance', 'student_id'], ['marks', 'student_id'], ['submissions', 'student_id']],
};

// ---------- RLS policy emulation (mirrors database/schema.sql + 001 migration) ----------
class Policy {
  constructor(private s: Store, private me: Me) {}
  private t = (n: string) => this.s.data.tables[n];
  private admin = () => this.me?.role === 'admin';
  private teaches = (courseId: string) => this.admin() || this.t('courses').some(c => c.id === courseId && c.teacher_id === this.me?.id);
  private member = (courseId: string) => this.teaches(courseId) || this.t('course_enrollments').some(e => e.course_id === courseId && e.student_id === this.me?.id);
  read(table: string, r: Row): boolean {
    if (!this.me) return true;
    const m = this.me.id;
    switch (table) {
      case 'profiles': return this.admin() || r.id === m || this.t('course_enrollments').some(e => e.student_id === r.id && this.member(e.course_id));
      case 'courses': return this.member(r.id);
      case 'course_enrollments': return this.admin() || r.student_id === m || this.teaches(r.course_id);
      case 'resources': case 'assignments': case 'quizzes': case 'timetable_slots': case 'chat_messages': return this.member(r.course_id);
      case 'announcements': return r.is_global || (!!r.course_id && this.member(r.course_id));
      case 'announcement_reads': return r.user_id === m;
      case 'submissions': { const a = this.t('assignments').find(x => x.id === r.assignment_id); return r.student_id === m || this.admin() || (!!a && this.teaches(a.course_id)); }
      case 'attendance': case 'marks': return r.student_id === m || this.teaches(r.course_id);
      case 'complaints': return r.student_id === m || this.admin();
      default: return this.admin();
    }
  }
  write(table: string, op: 'insert' | 'update' | 'delete', r: Row, before?: Row): boolean {
    if (!this.me) return true;
    const m = this.me.id;
    switch (table) {
      case 'courses': case 'course_enrollments': case 'timetable_slots': return this.admin();
      case 'resources': case 'assignments': case 'quizzes': case 'attendance': case 'marks': return this.teaches(r.course_id);
      case 'announcements': return this.admin() || (!!r.course_id && this.teaches(r.course_id));
      case 'announcement_reads': return r.user_id === m;
      case 'submissions': return op === 'insert' ? r.student_id === m && this.t('course_enrollments').some(e => e.student_id === m && this.t('assignments').some(a => a.id === r.assignment_id && a.course_id === e.course_id))
        : (before?.student_id === m && before?.marks_awarded == null) || this.admin();
      case 'profiles': return op === 'update' && (before?.id === m || this.admin());
      case 'complaints': return op === 'insert' ? r.student_id === m : this.admin();
      default: return this.admin();
    }
  }
}

// ---------- select-list parsing ----------
type Sel = { star: boolean; cols: string[]; embeds: { name: string; inner: Sel; count: boolean; hinted: boolean }[] };
// Tables with more than one FK to profiles: real PostgREST rejects an un-hinted profiles(...) embed on these.
const AMBIGUOUS_PROFILES = new Set(['marks', 'submissions', 'course_enrollments', 'complaints', 'attendance']);
function parseSelect(s: string): Sel {
  const out: Sel = { star: false, cols: [], embeds: [] };
  let depth = 0, cur = ''; const parts: string[] = [];
  for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) parts.push(cur);
  for (const raw of parts) {
    const p = raw.trim(); if (!p) continue;
    const open = p.indexOf('(');
    if (open < 0) { if (p === '*') out.star = true; else out.cols.push(p); continue; }
    const rawName = p.slice(0, open).trim(), name = rawName.split('!')[0], inner = p.slice(open + 1, p.lastIndexOf(')')).trim();
    out.embeds.push({ name, inner: parseSelect(inner), count: inner === 'count', hinted: rawName.includes('!') });
  }
  return out;
}

type Result = { data: any; error: Err | null; count?: number | null };
class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private sel = '*'; private wantRows = true; private countMode = false; private head = false;
  private filters: ((r: Row) => boolean)[] = []; private orders: { col: string; asc: boolean }[] = []; private lim = Infinity;
  private payload: any; private conflict: string[] = []; private mode: 'single' | 'maybe' | null = null;
  constructor(private s: Store, private table: string, private me: Me) {}

  select(sel = '*', opts?: { count?: string; head?: boolean }) { if (this.op === 'select') { this.sel = sel; this.countMode = !!opts?.count; this.head = !!opts?.head; } else { this.sel = sel; this.wantRows = true; } this.returning = true; return this; }
  private returning = false;
  insert(v: any) { this.op = 'insert'; this.payload = v; this.wantRows = false; return this; }
  update(v: any) { this.op = 'update'; this.payload = v; this.wantRows = false; return this; }
  upsert(v: any, o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = v; this.conflict = (o?.onConflict ?? 'id').split(',').map(x => x.trim()); this.wantRows = false; return this; }
  delete() { this.op = 'delete'; this.wantRows = false; return this; }
  eq(c: string, v: any) { this.filters.push(r => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push(r => r[c] !== v); return this; }
  in(c: string, vs: any[]) { this.filters.push(r => vs.includes(r[c])); return this; }
  gte(c: string, v: any) { this.filters.push(r => r[c] != null && r[c] >= v); return this; }
  lte(c: string, v: any) { this.filters.push(r => r[c] != null && r[c] <= v); return this; }
  ilike(c: string, pat: string) { const re = new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i'); this.filters.push(r => typeof r[c] === 'string' && re.test(r[c])); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) { return Promise.resolve().then(() => this.exec()).then(ok, bad); }

  private tbl() { return this.s.data.tables[this.table]; }
  private project(row: Row, sel: Sel, pol: Policy): Row {
    const out: Row = sel.star || (!sel.cols.length && !sel.embeds.length) ? { ...row } : Object.fromEntries(sel.cols.map(c => [c, row[c]]));
    for (const e of sel.embeds) {
      const rel = REL[this.table]?.[e.name] ?? Object.values(REL).map(r => r[e.name]).find(Boolean);
      const relMap = REL[this.table]?.[e.name];
      if (!relMap) { out[e.name] = null; continue; }
      if (relMap.target === 'profiles' && !e.hinted && AMBIGUOUS_PROFILES.has(this.table)) throw new Error(`Could not embed because more than one relationship was found for '${this.table}' and 'profiles' (use profiles!<fk>)`);
      const sub = new Query(this.s, relMap.target, this.me); void rel;
      if (relMap.many) {
        const kids = this.s.data.tables[relMap.target].filter(k => k[relMap.fk] === row.id && pol.read(relMap.target, k));
        out[e.name] = e.count ? [{ count: kids.length }] : kids.map(k => sub.project(k, e.inner, pol));
      } else {
        const t = this.s.data.tables[relMap.target].find(k => k.id === row[relMap.fk]);
        out[e.name] = t && pol.read(relMap.target, t) ? sub.project(t, e.inner, pol) : null;
      }
    }
    return out;
  }
  private finish(rows: Row[], pol: Policy, count?: number): Result {
    const sel = parseSelect(this.sel);
    const data = rows.map(r => this.project(r, sel, pol));
    if (this.mode === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: err(data.length ? 'Multiple rows returned' : 'The result contains 0 rows', 'PGRST116') };
    if (this.mode === 'maybe') return data.length > 1 ? { data: null, error: err('Multiple rows returned', 'PGRST116') } : { data: data[0] ?? null, error: null };
    return { data, error: null, count };
  }
  private checkRow(row: Row, existingId?: string): Err | null {
    for (const f of REQUIRED[this.table] ?? []) if (row[f] === undefined || row[f] === null || row[f] === '') return err(`null value in column "${f}" violates not-null constraint`, '23502');
    for (const [col, tgt] of Object.entries(FK)) if (row[col] != null && col in row && this.s.data.tables[tgt] && !this.s.data.tables[tgt].some(x => x.id === row[col])) return err(`Key (${col})=(${row[col]}) is not present in table "${tgt}"`, '23503');
    for (const keys of UNIQUE[this.table] ?? []) if (this.tbl().some(x => x.id !== existingId && keys.every(k => String(x[k] ?? '').toLowerCase() === String(row[k] ?? '').toLowerCase() && row[k] != null))) return err(`duplicate key value violates unique constraint on (${keys.join(',')})`, '23505');
    const t = this.table;
    if (t === 'attendance' && !['present', 'absent', 'late', 'leave'].includes(row.status)) return err('invalid attendance status', '23514');
    if (t === 'timetable_slots' && !(row.end_time > row.start_time)) return err('end_time must be after start_time', '23514');
    if (t === 'timetable_slots' && !(row.day_of_week >= 0 && row.day_of_week <= 6)) return err('day_of_week out of range', '23514');
    if (t === 'courses' && row.credit_hours != null && !(Number(row.credit_hours) > 0 && Number(row.credit_hours) <= 12)) return err('credit_hours out of range', '23514');
    if (t === 'marks' && (Number(row.score) < 0 || Number(row.max_score) <= 0)) return err('invalid marks', '23514');
    if (t === 'marks' && row.assignment_id == null && row.quiz_attempt_id == null && !row.assessment) return err('marks require an assignment, quiz attempt or assessment name', '23514');
    if (t === 'assignments' && !(Number(row.max_marks) > 0)) return err('max_marks must be positive', '23514');
    return null;
  }
  private defaults(row: Row): Row {
    const now = new Date().toISOString(); const d: Row = { id: randomUUID(), created_at: now, ...row };
    if (['courses', 'resources', 'assignments', 'quizzes', 'announcements', 'complaints', 'profiles'].includes(this.table)) d.updated_at = d.updated_at ?? now;
    if (this.table === 'courses') { d.credit_hours ??= 3; d.is_global ??= false; }
    if (this.table === 'announcements') d.is_global ??= false;
    if (this.table === 'submissions') d.submitted_at ??= now;
    if (this.table === 'course_enrollments') d.enrolled_at ??= now;
    return d;
  }
  private cascade(id: string) { for (const [t, fk] of CASCADE[this.table] ?? []) { const kids = this.s.data.tables[t].filter(k => k[fk] === id); this.s.data.tables[t] = this.s.data.tables[t].filter(k => k[fk] !== id); for (const k of kids) if (t === 'assignments') this.s.data.tables.submissions = this.s.data.tables.submissions.filter(x => x.assignment_id !== k.id); } }

  private exec(): Result {
    const pol = new Policy(this.s, this.me); const t = this.table;
    if (!this.s.data.tables[t]) return { data: null, error: err(`relation "public.${t}" does not exist`, '42P01') };
    const visible = () => this.tbl().filter(r => pol.read(t, r) && this.filters.every(f => f(r)));
    try {
      if (this.op === 'select') {
        let rows = visible();
        const total = rows.length;
        for (const o of [...this.orders].reverse()) rows = [...rows].sort((a, b) => (a[o.col] ?? '') < (b[o.col] ?? '') ? (o.asc ? -1 : 1) : (a[o.col] ?? '') > (b[o.col] ?? '') ? (o.asc ? 1 : -1) : 0);
        rows = rows.slice(0, this.lim);
        if (this.head) return { data: null, error: null, count: total };
        return this.finish(rows, pol, this.countMode ? total : undefined);
      }
      const arr: Row[] = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
      const out: Row[] = [];
      if (this.op === 'insert' || this.op === 'upsert') {
        for (const raw of arr) {
          const existing = this.op === 'upsert' ? this.tbl().find(x => this.conflict.every(k => x[k] === raw[k])) : undefined;
          if (existing) {
            const merged = { ...existing, ...raw, updated_at: new Date().toISOString() };
            if (!pol.write(t, 'update', merged, existing)) return { data: null, error: err('new row violates row-level security policy', '42501') };
            const e = this.checkRow(merged, existing.id); if (e) return { data: null, error: e };
            Object.assign(existing, merged); out.push(existing);
          } else {
            const row = this.defaults(raw);
            if (!pol.write(t, 'insert', row)) return { data: null, error: err(`new row violates row-level security policy for table "${t}"`, '42501') };
            const e = this.checkRow(row); if (e) return { data: null, error: e };
            this.tbl().push(row); out.push(row);
          }
        }
      } else {
        const targets = visible();
        for (const r of targets) {
          if (this.op === 'update') {
            const patch = { ...this.payload };
            if (t === 'profiles' && this.me && this.me.role !== 'admin') { for (const k of ['role', 'roll_number', 'email', 'program', 'semester']) delete patch[k]; } // protect_profile_columns trigger
            const merged = { ...r, ...patch, updated_at: new Date().toISOString() };
            if (!pol.write(t, 'update', merged, r)) continue;
            const e = this.checkRow(merged, r.id); if (e) return { data: null, error: e };
            Object.assign(r, merged); out.push(r);
          } else if (pol.write(t, 'delete', r, r)) { this.s.data.tables[t] = this.tbl().filter(x => x !== r); this.cascade(r.id); out.push(r); }
        }
      }
      this.s.save();
      if (!this.returning) return { data: null, error: null };
      return this.finish(out, pol);
    } catch (e) { return { data: null, error: err(e instanceof Error ? e.message : 'demo store error') }; }
  }
}

export function createFakeClient(s: Store, me: Me, publicBase: string) {
  const bucket = (b: string) => ({
    async createSignedUrl(p: string, _ttl: number, opts?: { download?: string }) {
      if (me) { const r = s.data.tables.resources.find(x => x.file_path === p); if (!r || !new Policy(s, me).read('resources', r)) return { data: null, error: err('Object not found') }; }
      const token = s.signJwt({ file: `${b}/${p}`, dl: opts?.download, recovery_only: true }, 60);
      return { data: { signedUrl: `${publicBase}/demo/files?token=${token}` }, error: null };
    },
    async createSignedUploadUrl() { return { data: null, error: err('Direct browser uploads are not available in demo mode; use the materials form.') }; },
    async upload(p: string, body: Buffer) { const f = path.join(s.filesDir, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return { data: { path: p }, error: null }; },
    async remove(paths: string[]) { for (const p of paths) fs.rmSync(path.join(s.filesDir, p), { force: true }); return { data: null, error: null }; },
  });
  const auth = {
    async signInWithPassword({ email, password }: { email: string; password: string }) { const sess = s.signIn(email, password); return sess ? { data: { session: sess, user: sess.user }, error: null } : { data: { session: null, user: null }, error: err('Invalid login credentials') }; },
    async getUser(token: string) { const u = s.userFromToken(token); return u ? { data: { user: { id: u.id, email: u.email } }, error: null } : { data: { user: null }, error: err('invalid JWT') }; },
    async resetPasswordForEmail(email: string, o?: { redirectTo?: string }) {
      const u = s.data.auth.find(a => a.email.toLowerCase() === email.toLowerCase());
      if (u) { const tok = s.signJwt({ sub: u.id, email: u.email }, 3600), rt = s.session(u).refresh_token; console.info(`[demo] password reset link for ${email}: ${o?.redirectTo ?? ''}#access_token=${tok}&refresh_token=${rt}&expires_in=3600&token_type=bearer&type=recovery`); }
      return { data: {}, error: null };
    },
    admin: {
      async createUser(o: { email: string; password: string; user_metadata?: Record<string, unknown> }) { const u = s.createUser(o.email, o.password, o.user_metadata ?? {}); return u ? { data: { user: { id: u.id, email: u.email } }, error: null } : { data: { user: null }, error: err('A user with this email address has already been registered') }; },
      async deleteUser(id: string) { s.deleteUser(id); return { data: null, error: null }; },
    },
  };
  return { from: (t: string) => new Query(s, t, me), storage: { from: bucket }, auth };
}
