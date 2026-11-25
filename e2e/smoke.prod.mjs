// Read-only production smoke test (safe on the ephemeral serverless demo deployment: no writes).
//   APP=https://gutech-lms-xi.vercel.app SHOTS=../submission/prod/ node smoke.prod.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const APP = process.env.APP || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || './prod-shots/';
const EXE = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const errors = [];
const check = (n, ok, d = '') => { results.push({ name: n, ok: !!ok, detail: d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ' — ' + d : ''}`); };
const T = { timeout: 20000 };
const b = await chromium.launch({ executablePath: EXE, headless: true });
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
async function ctxPage(w, h) { const ctx = await b.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); page.on('console', m => m.type() === 'error' && errors.push(`${page.url()} :: ${m.text()}`)); page.on('pageerror', e => errors.push(`${page.url()} :: ${e}`)); return { ctx, page }; }
async function login(page, id, pw) { await page.goto(APP + '/login'); await page.getByPlaceholder(/2023-BSCS|roll/i).fill(id); await page.getByPlaceholder('Enter your password').fill(pw); await page.getByRole('button', { name: 'Sign In' }).click(); await page.waitForSelector('main.content h1', T); await page.waitForFunction(() => Object.keys(localStorage).some(k => k.includes('auth-token')), null, T); }
const body = p => p.locator('main.content').innerText();

{
  const { ctx, page } = await ctxPage(390, 844);
  await page.goto(APP + '/login');
  check('Production login page loads (GU Tech branding)', await page.getByText('Student Portal').isVisible(T) && await page.getByText('Ghazali University').isVisible());
  check('Production shows DEMO MODE notice on login', await page.getByText(/DEMO MODE: sample data only/).waitFor(T).then(() => true).catch(() => false));
  await page.screenshot({ path: SHOTS + 'prod-login-mobile.png' });
  await page.getByRole('button', { name: 'Sign In' }).click();
  check('Empty login shows validation error', await page.getByRole('alert').getByText('Enter your roll number and password.').isVisible());
  await page.getByPlaceholder(/2023-BSCS/).fill('DEMO-2024-001'); await page.getByPlaceholder('Enter your password').fill('wrong-password-1'); await page.getByRole('button', { name: 'Sign In' }).click();
  check('Invalid credentials: generic error', await page.getByText('Invalid roll number or password.').waitFor(T).then(() => true).catch(() => false));
  await page.goto(APP + '/attendance'); await page.waitForURL('**/login', T); check('Protected route redirects to login when signed out', true);
  await page.goto(APP + '/login');
  await login(page, 'DEMO-2024-001', 'DemoStudent#2024');
  check('After login the user returns to the page they originally asked for (/attendance)', new URL(page.url()).pathname === '/attendance');
  await page.goto(APP + '/');
  await page.getByText('Total courses').waitFor(T);
  const d = (await body(page)).replace(/\n+/g, ' ');
  check('Student dashboard from production API: profile, 5 courses, 14 credit hours', d.includes('DEMO-2024-001') && /Total courses\s*5/.test(d) && /Credit hours\s*14/.test(d));
  check('Dashboard no horizontal overflow (390px)', !(await overflow(page)));
  await page.screenshot({ path: SHOTS + 'prod-dashboard-mobile.png', fullPage: true });
  const routes = [['/courses', /Programming Fundamentals/], ['/timetable', /Monday/], ['/attendance', /Overall attendance/], ['/results', /Semester GPA/], ['/assignments', /Assignment/], ['/notifications', /Announcements/]];
  for (const [r, re] of routes) { await page.goto(APP + r); await page.waitForSelector('main.content h1', T); await page.getByText(re).first().waitFor(T).catch(() => {}); check(`Student ${r} loads with data`, re.test(await body(page)) && !(await overflow(page))); }
  await page.goto(APP + '/manage'); await page.waitForTimeout(1500); check('Student blocked from /manage', new URL(page.url()).pathname === '/');
  await page.reload(); await page.waitForSelector('main.content h1', T); check('Session persists after refresh', !page.url().includes('/login'));
  await page.getByRole('button', { name: 'Open menu' }).click(); await page.getByRole('button', { name: /Log out/ }).click(); await page.waitForURL('**/login', T); check('Logout works', true);
  await ctx.close();
}
{
  const { ctx, page } = await ctxPage(1366, 800);
  await login(page, 'admin@demo.gutech.local', 'DemoAdmin#2024x'); await page.goto(APP + '/manage'); await page.getByText('Management console').waitFor(T);
  const tabs = await page.getByRole('tab').allInnerTexts();
  check('Admin login + management console shows all 8 sections', ['Students', 'Courses', 'Timetable', 'Attendance', 'Marks', 'Assignments', 'Announcements', 'Materials'].every(t => tabs.includes(t)));
  await page.getByRole('tab', { name: 'Students', exact: true }).click(); await page.getByText('DEMO-2024-003').first().waitFor(T).catch(() => {});
  check('Admin students list loads from production API', /DEMO-2024-00\d/.test(await body(page)));
  await page.screenshot({ path: SHOTS + 'prod-admin-desktop.png' });
  await ctx.close();
}
const rel = errors.filter(e => !/status of (400|401|403|409)/.test(e));
check('Production browser console: no unexpected errors', rel.length === 0, rel.slice(0, 3).join(' | '));
await b.close();
const f = results.filter(r => !r.ok).length;
fs.writeFileSync(SHOTS + 'prod-smoke-results.json', JSON.stringify({ run: new Date().toISOString(), app: APP, passed: results.length - f, total: results.length, results }, null, 1));
console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
