# Architecture

```
Browser (React SPA) --supabase-js (session only)--> Supabase Auth  /  DEMO: backend /auth/v1 shim
        |  fetch /api/* with Bearer JWT
        v
Express API (backend/src)
  authenticate  -> verifies JWT, loads profile (role)
  allowRoles    -> admin / teacher / student gate
  scopedDb(req) -> DB client carrying the CALLER's JWT, so Row Level Security applies
  adminDb       -> service role, used only for: roll-number lookup, instructor display names, user creation/deletion, storage upload, grading
        |
        v
Supabase Postgres + Storage (RLS)      /      DEMO: src/demo (JSON-file store, RLS emulation, same query interface)
```
- **Roll-number login:** `POST /api/auth/login` resolves roll number -> registered email server-side and signs in; identical error for unknown roll and wrong password; rate limited. The browser then adopts the returned session with `supabase.auth.setSession`.
- **Calculations** live in `backend/src/lib/academics.ts` (unit tested): attendance % = (present + late) / recorded sessions (null if none); weighted result when every assessment has a weightage, else raw; grade and GPA from the DEMO scale `GRADE_SCALE`; next class from the timetable in `INSTITUTE_TZ` (default Asia/Karachi). Dashboard and timetable read the same `timetable_slots` table.
- **Demo mode** (`DEMO_MODE=true`) swaps the three DB clients for `src/demo/fakeSupabase.ts`, which implements the used subset of supabase-js, enforces constraints/cascades and mirrors the RLS rules. It is a development and demonstration aid; it does not verify the production database.
- **Frontend** modules: `lib/auth.tsx` (session, profile), `lib/api.ts` (timeout, error mapping), `components/ui.tsx` (loaders, states), `pages/*`, `pages/admin/Admin.tsx` (generic validated create/edit/delete panels).
