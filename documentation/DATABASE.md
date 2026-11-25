# Database
Supabase project: `czvqvnhrlorgeipykrwg`.

1. Inspect the live schema first (Dashboard -> Table editor, or `supabase db dump --schema public`).
2. If the project is empty, run `database/schema.sql` then `database/migrations/001_gutech_academic.sql` in the SQL editor.
3. If tables already exist, do NOT run schema.sql. Diff it against the live schema and apply only what is missing; the 001 migration is additive and idempotent but assumes `profiles`, `courses`, `course_enrollments`, `assignments`, `marks`, `announcements` and the helper functions `is_admin()`, `is_course_member()`, `can_teach_course()` exist.
4. Create the first admin: sign up a user in Supabase Auth, then `update public.profiles set role='admin' where email='<admin email>';`.

Added by 001: `profiles.roll_number/program/semester`, `courses.credit_hours/semester/program`, `timetable_slots`, `attendance`, `marks.assessment/weightage`, RLS on both new tables, and a trigger that blocks non-admins changing role/roll number/email/program/semester.
Attendance % = (present + late) / all recorded sessions. Timezone for "today / next class": `INSTITUTE_TZ` (default `Asia/Karachi`).
