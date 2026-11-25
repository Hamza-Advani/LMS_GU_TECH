# GU Tech Student LMS Portal

A web-based learning management system for Ghazali University School of Technology (GU Tech): roll-number login, student dashboard, courses, timetable, attendance, marks & results, assignments, notifications, and an admin/teacher management console.

> **Honest status:** everything below was built and tested end to end in **DEMO MODE** (a file-backed demo database with SAMPLE data). A **demo deployment** is live (https://gutech-lms-xi.vercel.app, see [Deployment](#deployment)). It has **not** been run against the production Supabase project (`czvqvnhrlorgeipykrwg`) because no credentials/sign-in were available. See [Known limitations](#known-limitations) and [documentation/STATUS.md](documentation/STATUS.md).

## Features
**Student:** roll-number login, forgot/reset password, dashboard (profile, classes today, next class + room, attendance %, courses, credit hours, announcements, upcoming assignments, recent activity), course list and details (instructor, schedule, materials download, per-course attendance and marks), weekly and daily timetable (free-day states), attendance (overall, per course, history; shows "no records" instead of a misleading 0%), weighted marks/results with grades and GPA, assignments with submission status, notifications with read/unread and deadlines.
**Admin / teacher** (`/manage`): students (create/edit/delete/enroll), courses, timetable, attendance sheets (edit past dates), marks (validated, weighted), assignments, announcements, materials upload. Create/read/update/delete with validation, delete confirmations, loading/success/error states. Teachers only see their own courses; students get 403 on every admin endpoint.
**Quality:** reusable skeleton/spinner loaders with 15 s request timeout and retry on failure (no infinite loaders), reduced-motion support, responsive 320 px to desktop layout, `noindex` (private portal).

## Technologies
React 18 + TypeScript + Vite + React Query + React Router (frontend) · Node + Express + TypeScript + zod + helmet + rate limiting (backend) · Supabase (Postgres, Auth, Storage, RLS) in production, in-process demo database in DEMO MODE · Playwright (e2e) · node:test (unit).

## Folder structure
```
frontend/        React app (src/pages, src/components, src/lib). .env.demo = demo-mode config (no secrets)
backend/         Express API. src/routes (gutech.ts = GU Tech API, index.ts = base CRUD), src/lib/academics.ts (pure calculations),
                 src/demo (DEMO MODE database, RLS emulation, seed data), scripts/seed-supabase.ts, tests/
database/        schema.sql (baseline) and migrations/001_gutech_academic.sql (GU Tech additions, additive and idempotent)
e2e/             api.test.mjs (19 API workflow tests) and ui.test.mjs (63 real-browser checks)
documentation/   STATUS.md, DATABASE.md, DEMO_DATA.md, ARCHITECTURE.md, ASSETS.md
submission/      GU_Tech_LMS_Project_Report.pdf and the screenshots it uses
assets/          put reference screenshots here
```

## Quick start: DEMO MODE (works with no external services)
Requires Node 20+.
```
cd backend  && npm install && npm run reset:demo      # creates .demo-data/ with SAMPLE data
cd backend  && npm run dev:demo                        # API on http://localhost:4000
cd frontend && npm install && npm run dev:demo         # UI  on http://localhost:5173
```
Open http://localhost:5173. The login page shows the demo accounts (click "use demo student").

### Demo accounts (SAMPLE / DEMO only, never use these on a real deployment)
| Role | Login | Password |
|---|---|---|
| Student | roll number `DEMO-2024-001` | `DemoStudent#2024` |
| Admin | `admin@demo.gutech.local` | `DemoAdmin#2024x` |
| Teacher | `teacher@demo.gutech.local` (own courses: CS-101, CS-102) | `DemoTeacher#2024` |

Seven more students `DEMO-2024-002` to `DEMO-2024-008` use `DemoStudent#2024`. Demo mode only: these passwords exist only in the local demo database and in `backend/src/demo/seedData.ts`.

### Sample data: load and reset
`documentation/DEMO_DATA.md` lists exactly what is created. All ids are deterministic.
- `npm run seed:demo` (in `backend/`): upserts the sample data. Safe to run repeatedly; no duplicates; adds newly due attendance days; leaves other rows alone.
- `npm run reset:demo`: deletes the local demo database file (`backend/.demo-data/`) and reseeds. It can only touch that local file, never Supabase. (Admins can also `POST /api/demo/reset`.)
- Demo records are labelled SAMPLE/DEMO. Course names are generic; codes, timetable, rooms, instructors and the grading scale are illustrative, **not official GU Tech data**.

## Production setup with Supabase
1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`; fill in the keys for your project. Never commit `.env`. The service-role key is used only by the backend.
2. Database: follow [documentation/DATABASE.md](documentation/DATABASE.md) (inspect the live schema first; apply `database/migrations/001_gutech_academic.sql`).
3. Optional demo data in Supabase (not run or verified): `cd backend && npm run seed:supabase` (add `-- --reset` to remove only the seed's own rows/users). Creates the same demo accounts in your project; delete them before real use.
4. Run: `cd backend && npm run dev` and `cd frontend && npm run dev`.

## Testing
```
cd backend && npm test                  # 6 unit tests: attendance %, weighted result, grades, next class
cd backend && npm run typecheck && cd ../frontend && npm run typecheck
cd backend && npm run build && cd ../frontend && npm run build
# with demo backend + demo frontend running (see Quick start), on a clean demo DB:
cd e2e && npm install && npm run test        # 19 API workflow/permission tests
cd e2e && npm run test:ui                    # 63 real-browser checks; screenshots saved to ../submission/screenshots (needs Microsoft Edge or Chrome)
```
The e2e tests change demo data; run `npm run reset:demo` (backend stopped) before re-running them.
Lint: `cd backend && npm run lint` and `cd frontend && npm run lint` (ESLint + typescript-eslint + react-hooks; both clean).
Production smoke test (read-only): `cd e2e && APP=https://gutech-lms-xi.vercel.app SHOTS=../submission/prod/ node smoke.prod.mjs` (20 checks).

## Deployment
**Live DEMO (Vercel):** frontend https://gutech-lms-xi.vercel.app (project `gutech-lms`), API https://gutech-lms-api-ecru.vercel.app (project `gutech-lms-api`). Demo mode, SAMPLE data, not connected to Supabase.
- API (`backend/`): `vercel.json` + `api/index.js` run the compiled Express app as one serverless function. Environment (production): `DEMO_MODE=true`, `DEMO_DATA_DIR=/tmp/gutech-demo`, `DEMO_JWT_SECRET` (random, stored only in Vercel), `TRUST_PROXY=1`, `INSTITUTE_TZ`, `FRONTEND_ORIGIN`, `PUBLIC_API_URL`.
- Frontend (`frontend/`): `vercel.json` proxies `/api`, `/auth/v1` and `/demo/files` to the API (same-origin, no CORS) and adds security/noindex headers.
- Redeploy: `cd backend && vercel deploy --prod --yes`; `cd frontend && vercel deploy --prod --yes` (needs `vercel login`; `.vercel/` is git-ignored).
- **Real production** needs the Supabase project: set `DEMO_MODE` off, provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` on the API, and `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` on the frontend.

## Known limitations
- The live Vercel deployment is a DEMO on serverless: its demo database lives in each function instance's temporary storage, so data you create there can disappear or look inconsistent when a new instance starts. Do the admin-change demonstration locally. Anyone with the URL can use the published demo logins.
- Never run against the real `czvqvnhrlorgeipykrwg` project: the migration is unapplied and RLS policies there are unverified; demo mode emulates, but does not prove, the policies.
- Password-reset emails depend on Supabase Auth email/SMTP settings. In demo mode the reset link is printed to the API console instead.
- Assignment submissions are text responses (file submissions are not implemented). Course materials upload through the backend (10 MB, PDF/Word/PowerPoint/image/text).
- Grading scale and attendance eligibility threshold (75%) are DEMO settings; the official GU Tech policy was not available.
- Design follows the written brief; the reference screenshots/video and official logo were not available locally, so a "GU" text mark is used until `frontend/src/assets/brand/logo.png` is added.
- Session is stored by the browser a moment after login; a hard reload in that first split second signs the user out.
