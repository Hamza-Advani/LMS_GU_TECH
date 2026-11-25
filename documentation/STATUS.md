# Status and verification (honest record)

## Verified (executed)
**Local, DEMO mode (file-backed demo database, SAMPLE data):**
- ESLint clean (frontend + backend); strict `tsc` clean; both production builds succeed.
- 6 unit tests, 19 API end-to-end tests, 63 real-browser checks (login to logout, admin workflows, student sees every admin change, persistence after refresh, 3 viewports, console errors), 7 password-reset checks, restart persistence.

**Deployed DEMO on Vercel (read-only smoke test, real Edge browser, run twice):** 20/20 passed.
Frontend https://gutech-lms-xi.vercel.app -> API https://gutech-lms-api-ecru.vercel.app.
An earlier smoke run failed for two reasons: the script assumed it would land on the dashboard after login (the app correctly returns users to the page they first asked for), and the missing logo caused 404s. The 404s were fixed in the app (logo resolved at build time, inline favicon) and the script was corrected.

**Found and fixed in this audit:**
- PostgREST ambiguous `profiles` embeds (marks, submissions, course enrollments, complaints) that would have failed against real Supabase; the demo database now rejects un-hinted ambiguous embeds like PostgREST does.
- setState-in-effect patterns in auth and the attendance sheet (a race could overwrite a status the user had just chosen).
- Swallowed error causes in the API client; no top-level error boundary; no proxy trust for rate limiting behind Vercel; logo/favicon 404s; test races (the login page also matched the dashboard selector).

## NOT verified
- **Supabase project czvqvnhrlorgeipykrwg:** never accessed (connector not signed in, no keys). Migration 001 is unapplied; RLS there is unverified (demo mode emulates, does not prove it). The PostgREST embed fix was made from knowledge of its behaviour and is not tested against a live project. `seed-supabase.ts` has never been run.
- **Write workflows on the deployed demo:** the serverless demo database is per-instance temporary storage, so creates and edits there can vanish or look inconsistent when Vercel starts another instance. Observed: a full write-workflow browser run against production failed 4 persistence checks and was abandoned. Write workflows are verified locally only.
- Reference screenshots/video and the official logo were not available; design follows the written brief.
- Password-reset email delivery against real SMTP.

## Security notes
- The deployed demo publishes the demo logins (SAMPLE data only). Delete the two Vercel projects (`gutech-lms`, `gutech-lms-api`) after your submission if you do not want it public.
- Credentials found in the original LMS folder belong to another Supabase project and must be rotated by their owner (a copy exists in the local backup archive under `D:\Portel_backups`).
