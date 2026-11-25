// API end-to-end tests. Run against a backend started with DEMO_MODE=true (see README). Node 20+.
//   cd e2e && npm test        (BASE defaults to http://localhost:4000)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:4000';
const STUDENT = { identifier: 'DEMO-2024-001', password: 'DemoStudent#2024' };
const ADMIN = { identifier: 'admin@demo.gutech.local', password: 'DemoAdmin#2024x' };
const TEACHER = { identifier: 'teacher@demo.gutech.local', password: 'DemoTeacher#2024' };
const tok = {};
const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
};
const login = async c => (await call('POST', '/api/auth/login', { body: c })).json.access_token;
const stamp = Date.now().toString(36).toUpperCase();

before(async () => {
  assert.equal((await call('GET', '/health')).json.demo, true, 'backend must run with DEMO_MODE=true');
  tok.s = await login(STUDENT); tok.a = await login(ADMIN); tok.t = await login(TEACHER);
  assert.ok(tok.s && tok.a && tok.t, 'demo accounts must log in');
});

test('login: invalid credentials give one generic error (no account enumeration)', async () => {
  const wrong = await call('POST', '/api/auth/login', { body: { identifier: STUDENT.identifier, password: 'nope-nope-nope' } });
  const unknown = await call('POST', '/api/auth/login', { body: { identifier: 'NOPE-0000-999', password: 'nope-nope-nope' } });
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401); assert.equal(wrong.json.message, unknown.json.message);
  assert.equal((await call('POST', '/api/auth/login', { body: { identifier: 'x' } })).status, 400);
});
test('forgot password responds identically for known and unknown accounts', async () => {
  const a = await call('POST', '/api/auth/forgot', { body: { identifier: STUDENT.identifier } });
  const b = await call('POST', '/api/auth/forgot', { body: { identifier: 'NOPE-0000-999' } });
  assert.equal(a.status, 200); assert.deepEqual(a.json, b.json);
});
test('protected: no token / bad token rejected', async () => {
  assert.equal((await call('GET', '/api/dashboard')).status, 401);
  assert.equal((await call('GET', '/api/dashboard', { token: 'garbage.token.value' })).status, 401);
});

test('student dashboard: profile-independent real data, 5 courses / 14 credit hours', async () => {
  const me = (await call('GET', '/api/users/me', { token: tok.s })).json;
  assert.equal(me.roll_number, 'DEMO-2024-001'); assert.equal(me.role, 'student');
  const d = (await call('GET', '/api/dashboard', { token: tok.s })).json;
  assert.equal(d.totals.courses, 5); assert.equal(d.totals.creditHours, 14);
  assert.ok(d.attendance.total > 100 && d.attendance.percentage > 0 && d.attendance.percentage <= 100);
  assert.ok(d.nextClass?.title, 'next class resolved from timetable');
  assert.ok(d.announcements.length >= 1 && Array.isArray(d.upcomingAssignments) && d.recentActivity.length >= 1);
});
test('courses list shows instructor, credit hours; overview has attendance/marks/result', async () => {
  const cs = (await call('GET', '/api/courses', { token: tok.s })).json;
  assert.deepEqual(cs.map(c => c.code).sort(), ['CS-101', 'CS-102', 'HU-101', 'MT-102', 'PH-101']);
  assert.ok(cs.every(c => c.instructor && c.credit_hours > 0 && c.teacher_id === undefined));
  const ov = (await call('GET', `/api/courses/${cs.find(c => c.code === 'CS-101').id}/overview`, { token: tok.s })).json;
  assert.ok(ov.slots.length >= 3 && ov.marks.length === 3 && ov.attendance.total > 0 && ov.result.grade);
});
test('timetable consistent with dashboard (classes today)', async () => {
  const tt = (await call('GET', '/api/timetable', { token: tok.s })).json;
  const dow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })).getDay();
  const d = (await call('GET', '/api/dashboard', { token: tok.s })).json;
  assert.equal(d.classesToday.length, tt.filter(s => s.day_of_week === dow).length);
  assert.ok(tt.every(s => s.instructor));
});
test('results: weighted, graded, GPA; attendance totals reconcile', async () => {
  const r = (await call('GET', '/api/results', { token: tok.s })).json;
  assert.equal(r.courses.length, 5); assert.ok(r.courses.every(c => c.result.weighted && c.result.grade)); assert.ok(r.gpa > 0 && r.gpa <= 4);
  const at = (await call('GET', '/api/attendance', { token: tok.s })).json;
  assert.equal(at.courses.reduce((n, c) => n + c.total, 0), at.overall.total);
});
test('students are isolated: only own data visible', async () => {
  const sec = await login({ identifier: 'DEMO-2024-002', password: 'DemoStudent#2024' });
  const mine = (await call('GET', '/api/attendance', { token: tok.s })).json, theirs = (await call('GET', '/api/attendance', { token: sec })).json;
  assert.notDeepEqual(mine.history.map(h => h.id), theirs.history.map(h => h.id));
  assert.equal((await call('GET', '/api/results', { token: sec })).json.courses.length, 5);
});

test('permissions: student cannot use any admin/staff operation', async () => {
  const course = (await call('GET', '/api/courses', { token: tok.s })).json[0];
  const student2 = (await call('GET', '/api/admin/students', { token: tok.a })).json[1];
  for (const [m, p, b] of [
    ['GET', '/api/admin/students'], ['POST', '/api/admin/students', {}], ['POST', '/api/courses', { code: 'X-1', title: 'Nope' }], ['DELETE', `/api/courses/${course.id}`],
    ['POST', '/api/timetable', { course_id: course.id, day_of_week: 1, start_time: '10:00', end_time: '11:00' }],
    ['POST', '/api/attendance', { course_id: course.id, attended_on: '2026-01-01', records: [{ student_id: student2.id, status: 'present' }] }],
    ['POST', '/api/results', { student_id: student2.id, course_id: course.id, assessment: 'Hack', score: 1, max_score: 1 }],
    ['POST', '/api/assignments', { course_id: course.id, title: 'Nope', max_marks: 5 }], ['POST', '/api/announcements', { title: 'Nope', body: 'Nope', is_global: true }],
    ['POST', '/api/demo/reset'],
  ]) assert.equal((await call(m, p, { token: tok.s, body: b })).status, 403, `${m} ${p}`);
});
test('permissions: student cannot escalate role/identity via profile update', async () => {
  await call('PATCH', '/api/users/me', { token: tok.s, body: { full_name: 'Demo Student', department: 'School of Technology', role: 'admin' } });
  const me = (await call('GET', '/api/users/me', { token: tok.s })).json; assert.equal(me.role, 'student');
});
test('permissions: teacher limited to own courses', async () => {
  const mine = (await call('GET', '/api/courses', { token: tok.t })).json.map(c => c.code).sort(); assert.deepEqual(mine, ['CS-101', 'CS-102']);
  const other = (await call('GET', '/api/courses', { token: tok.a })).json.find(c => c.code === 'MT-102');
  const st = (await call('GET', '/api/admin/students', { token: tok.a })).json[0];
  assert.equal((await call('POST', '/api/results', { token: tok.t, body: { student_id: st.id, course_id: other.id, assessment: 'Not mine', score: 1, max_score: 2 } })).status, 400); // RLS rejects
  assert.equal((await call('GET', '/api/admin/students', { token: tok.t })).status, 403);
});

test('WORKFLOW course: admin creates course -> enrolls student -> student sees it (+ materials) -> edit -> delete', async () => {
  const code = `T-${stamp}`;
  const created = await call('POST', '/api/courses', { token: tok.a, body: { code, title: 'E2E Test Course', credit_hours: 2, description: 'SAMPLE e2e', semester: 1 } });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json.id;
  assert.equal((await call('POST', '/api/courses', { token: tok.a, body: { code, title: 'Dup', credit_hours: 2 } })).status, 400); // duplicate code rejected
  const me = (await call('GET', '/api/users/me', { token: tok.s })).json;
  assert.ok(!(await call('GET', '/api/courses', { token: tok.s })).json.some(c => c.id === id), 'not visible before enrolment');
  assert.equal((await call('POST', '/api/enrollments', { token: tok.a, body: { course_id: id, student_id: me.id } })).status, 201);
  const seen = (await call('GET', '/api/courses', { token: tok.s })).json.find(c => c.id === id); assert.equal(seen.credit_hours, 2);
  assert.equal((await call('GET', '/api/dashboard', { token: tok.s })).json.totals.creditHours, 16);
  // material upload -> student downloads
  const mat = await call('POST', '/api/materials', { token: tok.a, body: { course_id: id, title: 'SAMPLE: e2e notes', file_name: 'e2e.txt', mime_type: 'text/plain', content_base64: Buffer.from('hello e2e').toString('base64') } });
  assert.equal(mat.status, 201, JSON.stringify(mat.json));
  const dl = await call('GET', `/api/resources/${mat.json.id}/download`, { token: tok.s }); assert.equal(dl.status, 200);
  assert.equal(await (await fetch(dl.json.url)).text(), 'hello e2e');
  assert.equal((await call('POST', '/api/materials', { token: tok.a, body: { course_id: id, title: 'bad', file_name: 'x.exe', mime_type: 'application/x-msdownload', content_base64: 'AA==' } })).status, 400);
  // edit
  assert.equal((await call('PATCH', `/api/courses/${id}`, { token: tok.a, body: { title: 'E2E Test Course (edited)', credit_hours: 3 } })).status, 200);
  assert.equal((await call('GET', `/api/courses/${id}/overview`, { token: tok.s })).json.course.title, 'E2E Test Course (edited)');
  // delete (cascades enrolment/materials)
  assert.equal((await call('DELETE', `/api/courses/${id}`, { token: tok.a })).status, 204);
  assert.ok(!(await call('GET', '/api/courses', { token: tok.s })).json.some(c => c.id === id));
});

test('WORKFLOW timetable: admin adds slot -> appears for student and dashboard -> validation -> delete', async () => {
  const course = (await call('GET', '/api/courses', { token: tok.a })).json.find(c => c.code === 'CS-102');
  const bad = await call('POST', '/api/timetable', { token: tok.a, body: { course_id: course.id, day_of_week: 6, start_time: '12:00', end_time: '11:00' } });
  assert.equal(bad.status, 400);
  const add = await call('POST', '/api/timetable', { token: tok.a, body: { course_id: course.id, day_of_week: 6, start_time: '08:00', end_time: '09:00', room: 'E2E-1' } });
  assert.equal(add.status, 201, JSON.stringify(add.json));
  assert.ok((await call('GET', '/api/timetable', { token: tok.s })).json.some(s => s.id === add.json.id && s.room === 'E2E-1'));
  assert.equal((await call('POST', '/api/timetable', { token: tok.a, body: { course_id: course.id, day_of_week: 6, start_time: '08:00', end_time: '09:30' } })).status, 409); // same slot twice
  assert.equal((await call('PATCH', `/api/timetable/${add.json.id}`, { token: tok.a, body: { course_id: course.id, day_of_week: 6, start_time: '08:00', end_time: '09:30', room: 'E2E-2' } })).status, 200);
  assert.equal((await call('DELETE', `/api/timetable/${add.json.id}`, { token: tok.a })).status, 204);
  assert.ok(!(await call('GET', '/api/timetable', { token: tok.s })).json.some(s => s.id === add.json.id));
});

test('WORKFLOW attendance: admin changes record -> student history + percentage recalculated; future date rejected', async () => {
  const before = (await call('GET', '/api/attendance', { token: tok.s })).json;
  const course = (await call('GET', '/api/courses', { token: tok.a })).json.find(c => c.code === 'CS-101');
  const date = '2026-01-05'; // a date well outside the seeded 8-week window
  const roster = (await call('GET', `/api/courses/${course.id}/roster`, { token: tok.a })).json;
  const me = (await call('GET', '/api/users/me', { token: tok.s })).json;
  const records = roster.map(r => ({ student_id: r.student_id, status: r.student_id === me.id ? 'absent' : 'present' }));
  assert.equal((await call('POST', '/api/attendance', { token: tok.a, body: { course_id: course.id, attended_on: date, records } })).status, 201);
  const after = (await call('GET', '/api/attendance', { token: tok.s })).json;
  assert.equal(after.overall.total, before.overall.total + 1);
  assert.equal(after.overall.attended, before.overall.attended); // an absence adds a session but not an attended one
  assert.ok(after.overall.percentage < before.overall.percentage);
  assert.equal(after.history.find(h => h.attended_on === date && h.course_id === course.id).status, 'absent');
  // edit same sheet: absent -> present (upsert, no duplicate)
  await call('POST', '/api/attendance', { token: tok.a, body: { course_id: course.id, attended_on: date, records: records.map(r => ({ ...r, status: 'present' })) } });
  const fixed = (await call('GET', '/api/attendance', { token: tok.s })).json;
  assert.equal(fixed.overall.total, before.overall.total + 1); assert.equal(fixed.overall.attended, before.overall.attended + 1);
  const sheet = (await call('GET', `/api/attendance/sheet?course_id=${course.id}&date=${date}`, { token: tok.a })).json; assert.equal(sheet.length, roster.length);
  assert.equal((await call('POST', '/api/attendance', { token: tok.a, body: { course_id: course.id, attended_on: '2999-01-01', records } })).status, 400);
  assert.equal((await call('POST', '/api/attendance', { token: tok.a, body: { course_id: course.id, attended_on: date, records: [{ student_id: me.id, status: 'maybe' }] } })).status, 400);
});

test('WORKFLOW marks: admin publishes -> student result + grade change; over-max rejected; edit/delete', async () => {
  const course = (await call('GET', '/api/courses', { token: tok.a })).json.find(c => c.code === 'HU-101');
  const me = (await call('GET', '/api/users/me', { token: tok.s })).json;
  const get = async () => (await call('GET', '/api/results', { token: tok.s })).json.courses.find(c => c.course.code === 'HU-101');
  const b = await get();
  assert.equal((await call('POST', '/api/results', { token: tok.a, body: { student_id: me.id, course_id: course.id, assessment: 'Final Exam', score: 51, max_score: 50, weightage: 40 } })).status, 400, 'obtained > maximum must be rejected');
  assert.equal((await call('POST', '/api/results', { token: tok.a, body: { student_id: me.id, course_id: course.id, assessment: 'Final Exam', score: -1, max_score: 50, weightage: 40 } })).status, 400);
  const add = await call('POST', '/api/results', { token: tok.a, body: { student_id: me.id, course_id: course.id, assessment: 'Final Exam', score: 10, max_score: 50, weightage: 40 } });
  assert.equal(add.status, 201, JSON.stringify(add.json));
  const a = await get(); assert.equal(a.items.length, b.items.length + 1); assert.ok(a.result.percentage < b.result.percentage, 'low final lowers the course percentage');
  assert.equal((await call('PATCH', `/api/results/${add.json.id}`, { token: tok.a, body: { assessment: 'Final Exam', score: 50, max_score: 50, weightage: 40 } })).status, 200);
  assert.ok((await get()).result.percentage > a.result.percentage);
  assert.equal((await call('DELETE', `/api/results/${add.json.id}`, { token: tok.a })).status, 204);
  assert.equal((await get()).items.length, b.items.length);
});

test('WORKFLOW assignment: admin creates -> student sees -> submits (status) -> duplicate submit updates -> graded -> deleted', async () => {
  const course = (await call('GET', '/api/courses', { token: tok.a })).json.find(c => c.code === 'PH-101');
  const due = new Date(Date.now() + 2 * 864e5).toISOString();
  assert.equal((await call('POST', '/api/assignments', { token: tok.a, body: { course_id: course.id, title: 'E2E Lab', max_marks: 0, due_at: due } })).status, 400);
  const add = await call('POST', '/api/assignments', { token: tok.a, body: { course_id: course.id, title: 'E2E Lab', description: 'SAMPLE', max_marks: 10, due_at: due } });
  assert.equal(add.status, 201, JSON.stringify(add.json));
  assert.ok((await call('GET', '/api/assignments', { token: tok.s })).json.some(a => a.id === add.json.id));
  assert.ok((await call('GET', '/api/dashboard', { token: tok.s })).json.upcomingAssignments.some(a => a.id === add.json.id && a.submitted === false));
  assert.equal((await call('POST', '/api/submissions', { token: tok.s, body: { assignment_id: add.json.id } })).status, 400); // empty
  const sub = await call('POST', '/api/submissions', { token: tok.s, body: { assignment_id: add.json.id, text_response: 'my answer' } }); assert.equal(sub.status, 201, JSON.stringify(sub.json));
  assert.ok((await call('GET', '/api/dashboard', { token: tok.s })).json.upcomingAssignments.some(a => a.id === add.json.id && a.submitted === true));
  assert.equal((await call('POST', '/api/submissions', { token: tok.s, body: { assignment_id: add.json.id, text_response: 'revised answer' } })).status, 201);
  const mine = (await call('GET', '/api/submissions', { token: tok.s })).json.filter(s => s.assignment_id === add.json.id); assert.equal(mine.length, 1); assert.equal(mine[0].text_response, 'revised answer');
  assert.equal((await call('PATCH', `/api/submissions/${mine[0].id}/grade`, { token: tok.a, body: { marks_awarded: 9, feedback: 'SAMPLE good' } })).status, 200);
  assert.equal((await call('GET', '/api/submissions', { token: tok.s })).json.find(s => s.id === mine[0].id).marks_awarded, 9);
  assert.equal((await call('PATCH', `/api/submissions/${mine[0].id}/grade`, { token: tok.s, body: { marks_awarded: 10 } })).status, 403);
  assert.equal((await call('DELETE', `/api/assignments/${add.json.id}`, { token: tok.a })).status, 204);
});

test('WORKFLOW announcement: admin publishes -> student notified (unread) -> mark read -> edit -> delete', async () => {
  assert.equal((await call('POST', '/api/announcements', { token: tok.a, body: { title: 'x', body: 'y' } })).status, 400);
  const add = await call('POST', '/api/announcements', { token: tok.a, body: { title: `E2E notice ${stamp}`, body: 'SAMPLE body', is_global: true } }); assert.equal(add.status, 201, JSON.stringify(add.json));
  let n = (await call('GET', '/api/notifications', { token: tok.s })).json; assert.equal(n.announcements.find(a => a.id === add.json.id).read, false);
  assert.ok((await call('GET', '/api/dashboard', { token: tok.s })).json.announcements.some(a => a.id === add.json.id));
  assert.equal((await call('POST', `/api/announcements/${add.json.id}/read`, { token: tok.s })).status, 204);
  n = (await call('GET', '/api/notifications', { token: tok.s })).json; assert.equal(n.announcements.find(a => a.id === add.json.id).read, true);
  assert.equal((await call('PATCH', `/api/announcements/${add.json.id}`, { token: tok.a, body: { title: 'E2E notice edited', body: 'SAMPLE body', is_global: true } })).status, 200);
  assert.equal((await call('DELETE', `/api/announcements/${add.json.id}`, { token: tok.a })).status, 204);
});

test('WORKFLOW student management: create -> login by roll number -> edit -> duplicate rejected -> delete', async () => {
  const roll = `E2E-${stamp}`; const body = { roll_number: roll, full_name: 'E2E Student', email: `e2e.${stamp.toLowerCase()}@demo.gutech.local`, password: 'E2eStudent#2024', program: 'BS CS (DEMO)', semester: 1 };
  assert.equal((await call('POST', '/api/admin/students', { token: tok.a, body: { ...body, password: 'short' } })).status, 400);
  const add = await call('POST', '/api/admin/students', { token: tok.a, body }); assert.equal(add.status, 201, JSON.stringify(add.json));
  assert.equal((await call('POST', '/api/admin/students', { token: tok.a, body })).status, 409);
  const t = await login({ identifier: roll, password: body.password }); assert.ok(t);
  assert.equal((await call('GET', '/api/dashboard', { token: t })).json.totals.courses, 0);
  assert.equal((await call('PATCH', `/api/admin/students/${add.json.id}`, { token: tok.a, body: { semester: 2 } })).json.semester, 2);
  assert.equal((await call('DELETE', `/api/admin/students/${add.json.id}`, { token: tok.a })).status, 204);
  assert.equal((await call('POST', '/api/auth/login', { body: { identifier: roll, password: body.password } })).status, 401);
});

test('persistence: demo data is written to disk (restart checked separately)', async () => {
  const fs = await import('node:fs'); const f = new URL('../backend/.demo-data/db.json', import.meta.url);
  await new Promise(r => setTimeout(r, 400)); assert.ok(fs.existsSync(f)); assert.ok(fs.statSync(f).size > 100000);
});
