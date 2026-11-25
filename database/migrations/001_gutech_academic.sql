-- GU Tech LMS: academic extensions. ADDITIVE and idempotent: safe to re-run.
-- Requires the baseline in ../schema.sql (profiles, courses, course_enrollments, assignments, marks, announcements).
-- VERIFY against the live project before applying: if tables/columns below already exist with
-- different types, reconcile manually rather than relying on `if not exists`.

-- ---------- profiles: student identity ----------
alter table public.profiles
  add column if not exists roll_number text,
  add column if not exists program text,
  add column if not exists semester int check (semester is null or semester between 1 and 12);
create unique index if not exists profiles_roll_number_key on public.profiles (lower(roll_number)) where roll_number is not null;

-- ---------- courses: academic fields ----------
alter table public.courses
  add column if not exists credit_hours numeric(3,1) not null default 3 check (credit_hours > 0 and credit_hours <= 12),
  add column if not exists semester int check (semester is null or semester between 1 and 12),
  add column if not exists program text;

-- ---------- timetable ----------
create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  room text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (course_id, day_of_week, start_time)
);
create index if not exists timetable_course_day_idx on public.timetable_slots (course_id, day_of_week, start_time);

-- ---------- attendance ----------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attended_on date not null,
  status text not null check (status in ('present','absent','late','leave')),
  marked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (course_id, student_id, attended_on)
);
create index if not exists attendance_student_idx on public.attendance (student_id, attended_on desc);
create index if not exists attendance_course_date_idx on public.attendance (course_id, attended_on);

-- ---------- marks: allow exam-style assessments not tied to an assignment/quiz ----------
alter table public.marks add column if not exists assessment text;
alter table public.marks drop constraint if exists marks_check;
alter table public.marks drop constraint if exists marks_source_check;
alter table public.marks add constraint marks_source_check
  check (assignment_id is not null or quiz_attempt_id is not null or assessment is not null);

-- ---------- RLS ----------
alter table public.timetable_slots enable row level security;
alter table public.attendance enable row level security;

drop policy if exists timetable_read on public.timetable_slots;
create policy timetable_read on public.timetable_slots for select to authenticated
  using (public.is_course_member(course_id));
drop policy if exists timetable_admin_write on public.timetable_slots;
create policy timetable_admin_write on public.timetable_slots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
  using (student_id = auth.uid() or public.can_teach_course(course_id));
drop policy if exists attendance_staff_write on public.attendance;
create policy attendance_staff_write on public.attendance for all to authenticated
  using (public.can_teach_course(course_id)) with check (public.can_teach_course(course_id));

-- Students may read only their own profile fields; roll_number lookups happen server-side only.
-- Prevent students from escalating role or editing identity columns via the self-update policy.
create or replace function public.protect_profile_columns() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() and auth.uid() is not null and auth.role() = 'authenticated' then
    new.role := old.role; new.roll_number := old.roll_number; new.email := old.email;
    new.program := old.program; new.semester := old.semester;
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns before update on public.profiles for each row execute function public.protect_profile_columns();
