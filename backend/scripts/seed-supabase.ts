/**
 * Seeds SAMPLE / DEMO data into a REAL Supabase project. NOT RUN OR VERIFIED against czvqvnhrlorgeipykrwg (no credentials were available).
 *
 *   npm run seed:supabase            upsert demo users + sample rows (stable ids; safe to re-run)
 *   npm run seed:supabase -- --reset delete ONLY rows/users whose ids/emails belong to this seed, then re-seed
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env and database migration 001 applied.
 * Real academic records are never touched: every delete is scoped to the deterministic seed ids / @demo.gutech.local emails.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildSeed, DEMO_DOMAIN } from '../src/demo/seedData.js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || url.includes('demo.invalid')) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const seed = buildSeed();
const ORDER = ['courses', 'course_enrollments', 'timetable_slots', 'assignments', 'resources', 'announcements', 'submissions', 'marks', 'attendance'];
const must = (label: string, error: { message: string } | null) => { if (error) { console.error(`FAILED ${label}: ${error.message}`); process.exit(1); } };

if (process.argv.includes('--reset')) {
  for (const t of [...ORDER].reverse()) { const ids = (seed.tables as Record<string, { id: string }[]>)[t].map(r => r.id); for (let i = 0; i < ids.length; i += 200) must(`delete ${t}`, (await db.from(t).delete().in('id', ids.slice(i, i + 200))).error); }
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email?.endsWith(`@${DEMO_DOMAIN}`)) await db.auth.admin.deleteUser(u.id);
  console.log('Removed previous demo rows and users.');
}

const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
const idByEmail = new Map((existing?.users ?? []).map(u => [u.email!.toLowerCase(), u.id]));
const userId = new Map<string, string>(); // seed id -> real auth id
for (const u of seed.users) {
  let id = idByEmail.get(u.email.toLowerCase());
  if (!id) { const r = await db.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u.full_name } }); must(`create ${u.email}`, r.error); id = r.data.user!.id; }
  userId.set(u.id, id);
  must(`profile ${u.email}`, (await db.from('profiles').update({ full_name: u.full_name, role: u.role, roll_number: u.roll_number ?? null, program: u.program ?? null, department: u.department ?? null, semester: u.semester ?? null }).eq('id', id)).error);
}
const remap = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && userId.has(v) && ['teacher_id', 'created_by', 'student_id', 'enrolled_by', 'marked_by', 'entered_by', 'graded_by'].includes(k) ? userId.get(v) : v]));
for (const t of ORDER) {
  const rows = (seed.tables as Record<string, Record<string, unknown>[]>)[t].map(remap);
  for (let i = 0; i < rows.length; i += 200) must(`upsert ${t}`, (await db.from(t).upsert(rows.slice(i, i + 200), { onConflict: 'id' })).error);
  console.log(`${t}: ${rows.length} rows upserted`);
}
for (const [p, text] of Object.entries(seed.files)) must(`upload ${p}`, (await db.storage.from('course-resources').upload(p, Buffer.from(text), { contentType: 'text/plain', upsert: true })).error);
console.log('Done. Demo logins: see README (Demo accounts).');
