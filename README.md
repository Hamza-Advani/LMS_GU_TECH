# GU Tech Student LMS Portal

Student portal for Ghazali University School of Technology: roll-number login, dashboard, courses, timetable, attendance, results, assignments, notifications, and an admin/teacher console.

```
frontend/       React 18 + Vite + TypeScript SPA (maroon GU Tech theme)
backend/        Express + TypeScript API (Supabase auth/DB, zod validation, rate limiting)
database/       schema.sql (baseline) + migrations/001_gutech_academic.sql (GU Tech additions)
documentation/  Architecture, database, deployment, assets notes
assets/         Reference screenshots and logo source files
```

## Setup
1. `cp backend/.env.example backend/.env` and `cp frontend/.env.example frontend/.env`; fill in the Supabase keys for your project. Never commit `.env`.
2. Apply the database: see [documentation/DATABASE.md](documentation/DATABASE.md).
3. Place the logo at `frontend/public/brand/logo.png` ([documentation/ASSETS.md](documentation/ASSETS.md)).
4. `cd backend && npm install && npm run dev` (port 4000), then `cd frontend && npm install && npm run dev` (port 5173; `/api` is proxied to the backend).

Build: `npm run build` in each of `frontend/` and `backend/`.

## Security model
- Browser holds only the anon key. The service-role key is used server-side only (`backend/src/supabase.ts`).
- Roll-number login goes through `POST /api/auth/login`; the server resolves the roll number to the registered email and returns the same generic error for unknown roll numbers and wrong passwords. Rate limited (20 attempts / 15 min / IP). `POST /api/auth/forgot` always returns the same message.
- Data access uses the caller's JWT (`scopedDb`), so Row Level Security applies. Students can read only their own attendance, marks and submissions. A DB trigger stops non-admins from changing their own role, roll number, email, program or semester.
- Frontend and API set `noindex`; `robots.txt` disallows all crawling of the portal.

## Status
See [documentation/STATUS.md](documentation/STATUS.md) for what has and has not been verified.
