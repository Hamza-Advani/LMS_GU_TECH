# Status and verification (honest record)

## Built
Frontend: login (roll number), forgot/reset password, dashboard, courses + course detail (materials via signed download), weekly timetable, attendance (overall/per-course/history), results, assignments (student submit), notifications (read/unread + deadlines), management console (students, enrollment, courses, timetable, attendance, marks, assignments, announcements; admin and teacher roles). Skeleton loaders, spinners, 15 s request timeout, error states with retry, reduced-motion support.
Backend: `backend/src/routes/gutech.ts` (+ existing `routes/index.ts`). Database: `database/migrations/001_gutech_academic.sql`.

## Verified
- Frontend and backend compile (`npm run build`).
- UI test with a real Edge browser against the built frontend with the **network mocked** (API and Supabase auth intercepted): login validation and error states, successful login, dashboard content, all student routes at 390 / 820 / 1366 px (no horizontal overflow, no console errors), route guards (unauthenticated and student-vs-/manage), API-failure error state, logout. 47/47 checks. This is NOT a test against the real database.

## NOT verified (needs the Supabase project and keys)
- The migration has never been applied. It was written against `database/schema.sql` (the previous project's baseline), not the live `czvqvnhrlorgeipykrwg` schema, which could not be inspected. Compare before applying.
- Backend endpoints have not run against a real database: login, dashboard, attendance, RLS behaviour, storage downloads, student creation.
- Password-reset email delivery (needs SMTP/redirect URL configured in Supabase Auth).
- No unit tests for server logic (next-class and attendance calculation).
- Design is built from the written spec, not from the reference screenshots (none were available), and uses a text "GU" fallback until the official logo is added.
- Not deployed. Portfolio not updated. Nothing pushed to GitHub (no LMS repo specified).

## Security follow-ups
- The credentials found in the original `LMS GU TECH` folder (`.env` files and `.env.example`) belong to a different Supabase project and must be rotated there.
- Create the first admin by inserting a profile role manually (SQL editor); there is no public signup.
