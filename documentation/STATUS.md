# Status and verification (honest record)

## Verified (executed, demo mode: local demo database with SAMPLE data)
- Builds and strict type-checks (frontend, backend); 6 unit tests; 19 API end-to-end tests; 63 real-browser checks (login to logout, admin workflows, student sees every admin change, persistence after refresh, 3 viewports, console errors); password-reset flow (7 checks); demo restart persistence.
- Fixed during testing: attendance message cleared after save; attendance sheet race with late-loading data; unreadable next-class card; garbled banner character; Vite BOM; missing vite-env.d.ts.

## NOT verified
- **Production Supabase (czvqvnhrlorgeipykrwg):** never accessed (connector not signed in, no keys). Migration 001 is unapplied; RLS there is unverified (demo mode emulates, does not prove it). seed-supabase.ts has never been run.
- **Deployment:** none. Vercel connector works but no project exists; a deploy needs a hosted API and Supabase credentials.
- **Portfolio:** not changed (see PORTFOLIO_UPDATE.md).
- Reference screenshots/video and official logo were not available; design follows the written brief.
- No ESLint; password-reset email delivery untested against real SMTP.

## Security follow-ups
- Credentials found in the original LMS folder (.env files) belong to another Supabase project and must be rotated by their owner (copies exist in the local backup archive D:Portel_backups).
