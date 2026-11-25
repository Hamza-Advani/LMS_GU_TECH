// Real-browser end-to-end test (NO mocks): real frontend + real backend in DEMO_MODE + local demo database.
// Needs: backend `npm run dev:demo`, frontend `npm run dev:demo`, Microsoft Edge/Chrome. See README "Testing".
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.APP || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || new URL('../submission/screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const EXE = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
fs.mkdirSync(SHOTS, { recursive: true });
const STUDENT = { id: 'DEMO-2024-001', pw: 'DemoStudent#2024' }, ADMIN = { id: 'admin@demo.gutech.local', pw: 'DemoAdmin#2024x' };
const stamp = Date.now().toString(36).toUpperCase();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const consoleErrors = [];

async function open(w = 1366, h = 800) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`${page.url()} :: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`${page.url()} :: pageerror ${e}`));
  page.on('dialog', d => d.accept());
  return { ctx, page };
}
async function login(page, who) {
  await page.goto(BASE + '/login');
  await page.getByPlaceholder(/2023-BSCS|roll/i).fill(who.id); await page.getByPlaceholder('Enter your password').fill(who.pw);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForSelector('main.content h1', { timeout: 10000 });
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.includes('auth-token')), null, { timeout: 5000 }); // session persisted
}
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const nav = async (page, path, sel = 'main.content h1') => { await page.goto(BASE + path); await page.waitForSelector(sel, { timeout: 10000 }); await page.waitForLoadState('networkidle').catch(() => {}); };
const field = (page, form, name) => page.getByRole('form', { name: form }).locator(`[data-field="${name}"]`);
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
const settle = page => page.waitForLoadState('networkidle').catch(() => {});

// ================= STUDENT WORKFLOW =================
{
  const { ctx, page } = await open(390, 844);
  await page.goto(BASE + '/login');
  check('Login page loads with GU Tech branding + Student Portal', await page.getByText('Student Portal').isVisible() && await page.getByText('Ghazali University').isVisible());
  check('Demo accounts hint visible in demo mode', await page.getByText(/DEMO MODE: sample data only/).waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
  await page.screenshot({ path: SHOTS + 'login-mobile.png' });
  await page.getByRole('button', { name: 'Sign In' }).click();
  check('Empty login shows validation error', await page.getByRole('alert').getByText('Enter your roll number and password.').isVisible());
  await page.getByPlaceholder(/2023-BSCS/).fill(STUDENT.id); await page.getByPlaceholder('Enter your password').fill('wrong-password-1');
  await page.getByRole('button', { name: 'Sign In' }).click(); await page.getByText('Invalid roll number or password.').waitFor();
  check('Invalid credentials: generic error, stays on login', page.url().endsWith('/login'));
  await page.getByRole('button', { name: 'Show password' }).click();
  check('Password visibility toggle', await page.getByPlaceholder('Enter your password').getAttribute('type') === 'text');
  await page.getByPlaceholder('Enter your password').fill(STUDENT.pw); await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForSelector('main.content h1'); await settle(page);
  await page.getByText('Total courses').waitFor({ timeout: 8000 }); await page.getByText(/Today.s schedule/).waitFor({ timeout: 8000 });
  check('Student login -> dashboard', /Good (morning|afternoon|evening), Demo/.test(await page.locator('main.content h1').innerText()));
  const dash = await page.locator('main').innerText();
  check('Dashboard shows roll number, program, department, semester', ['DEMO-2024-001', 'BS Computer Science (DEMO)', 'School of Technology'].every(s => dash.includes(s)));
  check('Dashboard credit hours 14 and courses 5 from DB', /Total courses\s*5/i.test(dash.replace(/\n+/g, ' ')) && /Credit hours\s*14/i.test(dash.replace(/\n+/g, ' ')));
  check('Dashboard has attendance %, announcements, upcoming assignments, activity', /\d+(\.\d)?%/.test(dash) && dash.includes('SAMPLE: Midterm') && /Upcoming assignments/i.test(dash) && /Recent activity/i.test(dash));
  check('Dashboard next class / today panel present', /Next class/i.test(dash) && /Today.s schedule/i.test(dash));
  check('Dashboard: no horizontal overflow @390', !(await overflow(page)));
  await page.screenshot({ path: SHOTS + 'dashboard-mobile.png', fullPage: true });
  // card navigation
  await page.getByRole('link', { name: /Attendance\s*\d/ }).first().click(); await page.waitForURL('**/attendance');
  check('Attendance card opens attendance page', true);
  await page.goBack(); await page.getByRole('link', { name: /Total courses/ }).click(); await page.waitForURL('**/courses');
  check('Courses card opens courses page', true);
  // session persistence
  await page.reload(); await page.waitForSelector('main.content h1');
  check('Session persists after refresh', !page.url().includes('/login'));
  await ctx.close();
}

{
  const { ctx, page } = await open(1366, 800);
  await login(page, STUDENT); await settle(page);
  await page.screenshot({ path: SHOTS + 'dashboard-desktop.png', fullPage: true });
  await nav(page, '/courses'); await settle(page);
  const names = await page.locator('main h3').allInnerTexts();
  check('Courses list: 5 sample courses incl. required names', ['Programming Fundamentals', 'Discrete Mathematics', 'Introduction to Computing', 'English', 'Applied Physics'].every(n => names.includes(n)));
  check('Course cards show credit hours + instructor', /3 credit hours · Demo Instructor/.test(await page.locator('main').innerText()));
  await page.screenshot({ path: SHOTS + 'courses-desktop.png', fullPage: true });
  await page.getByRole('link', { name: /Programming Fundamentals/ }).click(); await page.waitForURL(/\/courses\/.+/); await page.waitForSelector('text=Class schedule'); await settle(page);
  const cd = await page.locator('main').innerText();
  check('Course detail: code, title, credits, instructor', ['CS-101', 'Programming Fundamentals', '3 credit hours', 'Instructor: Demo Instructor (Programming)'].every(s => cd.includes(s)));
  check('Course detail: attendance %, result + grade, marks table, schedule, materials, assignments', /Attendance\s*\n*\s*\d/.test(cd) && /Result so far/.test(cd) && /Quiz 1/.test(cd) && /Midterm Exam/.test(cd) && /Mon/.test(cd) && /SAMPLE: Course outline/.test(cd) && /Assignment 1: Variables/.test(cd));
  await page.screenshot({ path: SHOTS + 'course-detail-desktop.png', fullPage: true });
  // material download
  const dlPromise = new Promise(res => { ctx.on('page', p => p.on('download', d => res(d))); page.on('download', d => res(d)); setTimeout(() => res(null), 10000); });
  await page.getByRole('button', { name: /Download/ }).first().click();
  const dl = await dlPromise;
  if (dl) { const p = await dl.path(); const txt = fs.readFileSync(p, 'utf8'); check('Material download delivers the file (signed link)', /SAMPLE DOCUMENT/.test(txt) && /CS-101/.test(dl.suggestedFilename())); } else check('Material download delivers the file (signed link)', false, 'no download event');
  await nav(page, '/timetable'); await settle(page);
  const week = await page.locator('main').innerText();
  check('Timetable weekly: all weekday headings, instructor + room shown', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].every(d => week.includes(d)) && /Room B-101/.test(week) && /Demo Instructor/.test(week));
  check('Timetable shows weekend free-day state', /Weekend: no classes/.test(week));
  await page.screenshot({ path: SHOTS + 'timetable-desktop.png', fullPage: true });
  await tab(page, 'Daily'); await page.getByRole('button', { name: /^Sat/ }).click();
  check('Timetable daily view: free-day state', await page.getByText('Free day: no classes scheduled.').isVisible());
  await nav(page, '/attendance'); await settle(page);
  const at = await page.locator('main').innerText();
  check('Attendance: overall %, course-wise cards, history table', /Overall attendance/.test(at) && /CS-101/.test(at) && /History/.test(at) && /(Present|Absent|Late|Leave)/i.test(at));
  await page.screenshot({ path: SHOTS + 'attendance-desktop.png', fullPage: true });
  await nav(page, '/results'); await settle(page);
  const rs = await page.locator('main').innerText();
  check('Results: GPA, per-course %, grade, weights, marks', /Semester GPA/.test(rs) && /DEMO grading scale/.test(rs) && /Midterm Exam/.test(rs) && /30%/.test(rs) && /· (A|A-|B\+|B|B-|C\+|C|D|F)\b/.test(rs));
  await page.screenshot({ path: SHOTS + 'results-desktop.png', fullPage: true });
  await nav(page, '/assignments'); await settle(page);
  const as = await page.locator('main').innerText();
  check('Assignments: list, due dates, statuses (Graded / Submitted / Pending)', /Assignment 2: Functions/.test(as) && /Graded/.test(as) && /Pending/.test(as) && /Due /.test(as));
  await page.screenshot({ path: SHOTS + 'assignments-desktop.png', fullPage: true });
  // submit a pending assignment
  const card = page.locator('section.card', { hasText: 'Assignment 2: Functions' });
  await card.getByRole('button', { name: 'Submit work' }).click();
  await card.getByRole('button', { name: 'Submit', exact: true }).click();
  check('Empty submission is rejected with a message', await card.getByRole('alert').isVisible());
  await card.locator('textarea').fill('SAMPLE answer submitted by the e2e test.'); await card.getByRole('button', { name: 'Submit', exact: true }).click();
  await card.getByText('Submitted', { exact: false }).first().waitFor(); await page.reload(); await page.waitForSelector('main.content h1'); await settle(page);
  check('Submission persists after refresh with status + date', /Submitted/.test(await page.locator('section.card', { hasText: 'Assignment 2: Functions' }).innerText()));
  await nav(page, '/notifications'); await settle(page);
  const nt = await page.locator('main').innerText();
  check('Notifications: announcements + upcoming deadlines', /SAMPLE: Welcome/.test(nt) && /Upcoming deadlines/.test(nt));
  const unread = await page.getByRole('button', { name: 'Mark read' }).count();
  if (unread) { await page.getByRole('button', { name: 'Mark read' }).first().click(); const ok = await page.waitForFunction(n => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Mark read').length === n, unread - 1, { timeout: 5000 }).then(() => true).catch(() => false); check('Mark-as-read reduces unread count', ok); } else check('Mark-as-read reduces unread count', false, 'no unread');
  // permissions in the UI
  await page.goto(BASE + '/manage'); await page.waitForTimeout(800);
  check('Student redirected away from /manage', new URL(page.url()).pathname === '/');
  check('Student nav has no Manage link', await page.getByRole('link', { name: 'Manage' }).count() === 0);
  // logout
  await page.getByRole('button', { name: /Log out/ }).click(); await page.waitForURL('**/login');
  await page.goto(BASE + '/results'); await page.waitForURL('**/login');
  check('Logout works and protected route redirects to login', true);
  await ctx.close();
}

// ================= ADMIN WORKFLOW (+ verification in student portal) =================
const code = `E2E-${stamp}`, title = `E2E Course ${stamp}`, announcement = `E2E Notice ${stamp}`, assignment = `E2E Assignment ${stamp}`;
{
  const { ctx, page } = await open(1366, 900);
  await login(page, ADMIN); await settle(page);
  check('Admin login -> dashboard with management shortcut', await page.getByRole('link', { name: /Management/ }).isVisible());
  await nav(page, '/manage', 'text=Management console'); await settle(page);
  await page.screenshot({ path: SHOTS + 'admin-students.png', fullPage: true });
  const tabs = await page.getByRole('tab').allInnerTexts();
  check('Admin sees all 8 management sections', ['Students', 'Courses', 'Timetable', 'Attendance', 'Marks', 'Assignments', 'Announcements', 'Materials'].every(t => tabs.includes(t)));

  // --- course create (validation, create, edit)
  await tab(page, 'Courses'); await settle(page);
  await page.getByRole('form', { name: 'Add course' }).getByRole('button', { name: 'Add course' }).click();
  check('Course form validates required fields', await page.getByRole('form', { name: 'Add course' }).getByRole('alert').isVisible());
  await field(page, 'Add course', 'code').fill(code); await field(page, 'Add course', 'title').fill(title); await field(page, 'Add course', 'credit_hours').fill('2');
  await field(page, 'Add course', 'description').fill('SAMPLE: created by the e2e test');
  await page.getByRole('form', { name: 'Add course' }).getByRole('button', { name: 'Add course' }).click();
  await page.getByText('Saved successfully.').waitFor(); await settle(page);
  check('Admin creates course -> listed', await page.getByText(title).first().isVisible());
  await field(page, 'Add course', 'code').fill('CS-101'); await field(page, 'Add course', 'title').fill('Dup'); await field(page, 'Add course', 'credit_hours').fill('3');
  await page.getByRole('form', { name: 'Add course' }).getByRole('button', { name: 'Add course' }).click();
  check('Duplicate course code rejected with message', await page.getByRole('form', { name: 'Add course' }).getByRole('alert').waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
  await page.reload(); await page.waitForSelector('text=Management console'); await tab(page, 'Courses'); await settle(page);
  check('Created course persists after refresh', await page.getByText(title).first().isVisible());
  await page.locator('li', { hasText: title }).getByRole('button', { name: 'Edit course' }).click();
  await field(page, 'Edit course', 'credit_hours').fill('3'); await field(page, 'Edit course', 'teacher_id').selectOption({ label: 'Demo Instructor (Programming)' });
  await page.getByRole('button', { name: 'Save changes' }).click(); await page.getByText('Changes saved.').waitFor().catch(() => {}); await settle(page);
  check('Admin edits course (credit hours + instructor)', await page.locator('li', { hasText: title }).getByText(/3 credit hours · Demo Instructor \(Programming\)/).isVisible());

  // --- enroll demo student into the new course
  await tab(page, 'Students'); await settle(page);
  await field(page, 'Enroll student in a course', 'course_id').selectOption({ label: `${code} · ${title}` });
  await field(page, 'Enroll student in a course', 'student_id').selectOption({ label: 'DEMO-2024-001 · Demo Student' });
  await page.getByRole('button', { name: 'Enroll', exact: true }).click(); await page.getByText('Saved successfully.').waitFor();
  check('Admin enrolls demo student in new course', true);

  // --- timetable entry (validation + create)
  await tab(page, 'Timetable'); await settle(page);
  await field(page, 'Add class slot', 'course_id').selectOption({ label: `${code} · ${title}` }); await field(page, 'Add class slot', 'day_of_week').selectOption('6');
  await field(page, 'Add class slot', 'start_time').fill('13:00'); await field(page, 'Add class slot', 'end_time').fill('12:00'); await field(page, 'Add class slot', 'room').fill('E2E-ROOM');
  await page.getByRole('button', { name: 'Add class slot' }).click();
  check('Timetable: end before start rejected', await page.getByRole('form', { name: 'Add class slot' }).getByRole('alert').getByText(/after start/i).waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
  await field(page, 'Add class slot', 'end_time').fill('14:00'); await page.getByRole('button', { name: 'Add class slot' }).click(); await page.getByText('Saved successfully.').waitFor();
  check('Admin creates timetable entry', true);

  // --- attendance: mark Demo Student absent on a past date
  await tab(page, 'Attendance'); await settle(page);
  await page.getByLabel('Course', { exact: true }).selectOption({ label: 'CS-101 · Programming Fundamentals' }); await page.waitForSelector('text=Mark attendance');
  await page.getByLabel('Attendance date').fill('2026-01-06'); await settle(page);
  await page.waitForFunction(() => { const s = document.querySelector('select[aria-label="Status for Demo Student"]'); return s && !s.disabled; }); await page.getByLabel('Status for Demo Student', { exact: true }).selectOption('absent');
  await page.getByRole('button', { name: 'Save attendance' }).click(); await page.getByText(/Saved \d+ records for 2026-01-06/).waitFor();
  check('Admin updates attendance', true);

  // --- marks: add (validation, create)
  await tab(page, 'Marks'); await settle(page);
  await page.getByLabel('Course', { exact: true }).selectOption({ label: 'HU-101 · English' }); await page.waitForSelector('form[aria-label="Add mark"]');
  await field(page, 'Add mark', 'student_id').selectOption({ label: 'DEMO-2024-001 · Demo Student' }); await field(page, 'Add mark', 'assessment').fill('E2E Final'); await field(page, 'Add mark', 'score').fill('99'); await field(page, 'Add mark', 'max_score').fill('50'); await field(page, 'Add mark', 'weightage').fill('40');
  await page.getByRole('button', { name: 'Add mark' }).click(); await page.waitForTimeout(500);
  check('Marks: obtained > maximum rejected', await page.getByRole('form', { name: 'Add mark' }).getByRole('alert').getByText(/cannot exceed/i).isVisible());
  await field(page, 'Add mark', 'score').fill('20'); await page.getByRole('button', { name: 'Add mark' }).click(); await page.getByText('Saved successfully.').waitFor();
  check('Admin adds marks', true);

  // --- assignment
  await tab(page, 'Assignments'); await settle(page);
  await field(page, 'Add assignment', 'course_id').selectOption({ label: `${code} · ${title}` }); await field(page, 'Add assignment', 'title').fill(assignment); await field(page, 'Add assignment', 'max_marks').fill('25');
  const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 16); await field(page, 'Add assignment', 'due_at').fill(due); await field(page, 'Add assignment', 'description').fill('SAMPLE: e2e');
  await page.getByRole('button', { name: 'Add assignment' }).click(); await page.getByText('Saved successfully.').waitFor();
  check('Admin creates assignment', true);

  // --- announcement
  await tab(page, 'Announcements'); await settle(page);
  await field(page, 'Add announcement', 'title').fill(announcement); await field(page, 'Add announcement', 'body').fill('SAMPLE: e2e announcement body'); await page.getByLabel('Send to the whole campus').check();
  await page.getByRole('button', { name: 'Add announcement' }).click(); await page.getByText('Saved successfully.').waitFor();
  check('Admin publishes announcement', true);

  // --- material upload
  await tab(page, 'Materials'); await settle(page);
  await field(page, 'Upload course material', 'course_id').selectOption({ label: `${code} · ${title}` }); await field(page, 'Upload course material', 'title').fill('SAMPLE: e2e handout');
  await field(page, 'Upload course material', 'file').setInputFiles({ name: 'e2e-handout.txt', mimeType: 'text/plain', buffer: Buffer.from('SAMPLE e2e handout contents') });
  await page.getByRole('button', { name: 'Upload', exact: true }).click(); await page.getByText('Saved successfully.').waitFor();
  check('Admin uploads course material', true);
  await page.screenshot({ path: SHOTS + 'admin-materials.png', fullPage: true });
  await ctx.close();
}

// ---- verify every admin change in the student portal
{
  const { ctx, page } = await open(1366, 900);
  await login(page, STUDENT); await settle(page);
  await nav(page, '/courses'); await settle(page);
  check('STUDENT sees admin-created course', await page.getByText(title).first().isVisible());
  await page.getByRole('link', { name: new RegExp(title) }).click(); await page.waitForSelector('text=Class schedule'); await settle(page);
  const t = await page.locator('main').innerText();
  check('STUDENT sees course detail: instructor, credits, timetable slot, material, assignment', t.includes('Instructor: Demo Instructor (Programming)') && t.includes('3 credit hours') && /Sat/.test(t) && t.includes('Room E2E-ROOM') && t.includes('SAMPLE: e2e handout') && t.includes(assignment));
  await page.screenshot({ path: SHOTS + 'student-sees-admin-course.png', fullPage: true });
  await nav(page, '/timetable'); await settle(page);
  check('STUDENT timetable shows new slot', /E2E-ROOM/.test(await page.locator('main').innerText()));
  await nav(page, '/attendance'); await settle(page);
  check('STUDENT attendance history shows the absence the admin recorded', /Jan 6, 2026[\s\S]{0,60}CS-101[\s\S]{0,40}absent/i.test(await page.locator('main').innerText()));
  await nav(page, '/results'); await settle(page);
  const r = await page.locator('main').innerText(); check('STUDENT results show marks the admin added (20/50)', r.includes('E2E Final') && r.includes('20/50'));
  await nav(page, '/assignments'); await settle(page);
  check('STUDENT sees new assignment as Pending', /Pending/.test(await page.locator('section.card', { hasText: assignment }).innerText()));
  await nav(page, '/notifications'); await settle(page);
  check('STUDENT sees announcement (unread)', await page.locator('li.unread', { hasText: announcement }).isVisible());
  await nav(page, '/'); await settle(page);
  const d = await page.locator('main').innerText();
  check('STUDENT dashboard reflects change: announcement + assignment + 17 credit hours', d.includes(announcement) && d.includes(assignment) && /Credit hours\s*\n*\s*17/.test(d));
  await ctx.close();
}

// ================= RESPONSIVE SWEEP =================
for (const [w, h, label] of [[390, 844, 'mobile'], [820, 1100, 'tablet'], [1366, 800, 'desktop']]) {
  const { ctx, page } = await open(w, h); await login(page, STUDENT);
  const bad = [];
  for (const r of ['/', '/courses', '/timetable', '/attendance', '/results', '/assignments', '/notifications']) { await nav(page, r); await settle(page); if (await overflow(page)) bad.push(r); if (label === 'mobile' && r !== '/') await page.screenshot({ path: SHOTS + `${label}${r.replace(/\//g, '-')}.png`, fullPage: true }); }
  check(`Responsive ${label} (${w}px): student routes have no horizontal overflow`, bad.length === 0, bad.join(','));
  await ctx.close();
  const a = await open(w, h); await login(a.page, ADMIN); await nav(a.page, '/manage', 'text=Management console');
  const badA = []; for (const tname of ['Students', 'Courses', 'Timetable', 'Attendance', 'Marks', 'Assignments', 'Announcements', 'Materials']) { await tab(a.page, tname); await settle(a.page); if (await overflow(a.page)) badA.push(tname); }
  check(`Responsive ${label} (${w}px): admin sections have no horizontal overflow`, badA.length === 0, badA.join(','));
  if (label === 'mobile') { await tab(a.page, 'Courses'); await a.page.screenshot({ path: SHOTS + 'admin-courses-mobile.png', fullPage: true }); }
  await a.ctx.close();
}

const relevant = consoleErrors.filter(e => !/Failed to load resource: the server responded with a status of (401|403|404|400|409)/.test(e));
check('Browser console: no unexpected errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok);
fs.writeFileSync(SHOTS + '../ui-test-results.json', JSON.stringify({ run: new Date().toISOString(), passed: results.length - failed.length, total: results.length, results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed`); process.exit(failed.length ? 1 : 0);
