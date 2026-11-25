-- Northstar LMS schema. Run once in Supabase SQL editor or with `supabase db push`.
create extension if not exists pgcrypto;

create table public.roles (
  key text primary key check (key in ('admin','teacher','student')),
  label text not null unique
);
insert into public.roles(key,label) values ('admin','Administrator'),('teacher','Teacher'),('student','Student') on conflict do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', email text not null unique,
  role text not null default 'student' references public.roles(key),
  department text, avatar_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.courses (
  id uuid primary key default gen_random_uuid(), title text not null, code text not null unique,
  description text, teacher_id uuid references public.profiles(id) on delete set null,
  is_global boolean not null default false, created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade, enrolled_by uuid references public.profiles(id),
  enrolled_at timestamptz not null default now(), unique(course_id,student_id)
);
create table public.resources (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  title text not null, description text, file_path text not null, file_name text not null,
  file_size bigint not null check(file_size>0), mime_type text not null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  title text not null, description text, due_at timestamptz, max_marks numeric(8,2) not null check(max_marks>0), attachment_path text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.submissions (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade, text_response text, file_path text,
  submitted_at timestamptz not null default now(), marks_awarded numeric(8,2) check(marks_awarded>=0), feedback text, graded_by uuid references public.profiles(id), graded_at timestamptz,
  unique(assignment_id,student_id), check(text_response is not null or file_path is not null)
);
create table public.quizzes (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  title text not null, description text, time_limit_minutes int not null check(time_limit_minutes between 1 and 240),
  attempt_limit int not null default 1 check(attempt_limit between 1 and 20), opens_at timestamptz, closes_at timestamptz,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.questions (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null, question_type text not null check(question_type in ('mcq','true_false','short_answer')),
  options jsonb not null default '[]'::jsonb, correct_answer text not null, points numeric(8,2) not null default 1 check(points>0), position int not null default 0
);
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade, answers jsonb not null default '{}'::jsonb,
  score numeric(7,2), started_at timestamptz not null default now(), submitted_at timestamptz
);
create table public.marks (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade, assignment_id uuid references public.assignments(id) on delete set null,
  quiz_attempt_id uuid references public.quiz_attempts(id) on delete set null, score numeric(8,2) not null check(score>=0),
  max_score numeric(8,2) not null check(max_score>0), feedback text, entered_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(assignment_id is not null or quiz_attempt_id is not null)
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(), course_id uuid references public.courses(id) on delete cascade,
  title text not null, body text not null, is_global boolean not null default false,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, read_at timestamptz not null default now(),
  primary key(announcement_id,user_id)
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade, body text not null check(length(body) between 1 and 5000),
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.complaints (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check(category in ('academic','facilities','technology','other')), subject text not null, description text not null,
  attachment_path text, status text not null default 'open' check(status in ('open','in_progress','resolved')),
  admin_reply text, handled_by uuid references public.profiles(id), resolved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index enrollments_student_idx on public.course_enrollments(student_id,course_id);
create index resources_course_created_idx on public.resources(course_id,created_at desc);
create index assignments_course_due_idx on public.assignments(course_id,due_at);
create index submissions_student_idx on public.submissions(student_id,submitted_at desc);
create index quizzes_course_idx on public.quizzes(course_id);
create index questions_quiz_position_idx on public.questions(quiz_id,position);
create index attempts_student_quiz_idx on public.quiz_attempts(student_id,quiz_id,started_at desc);
create index marks_student_course_idx on public.marks(student_id,course_id);
create index announcements_course_idx on public.announcements(course_id,created_at desc);
create index chat_course_created_idx on public.chat_messages(course_id,created_at desc);
create index complaints_status_created_idx on public.complaints(status,created_at desc);

create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.current_role()='admin',false) $$;
create or replace function public.is_course_member(target_course uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(select 1 from public.courses c where c.id=target_course and c.teacher_id=auth.uid()) or exists(select 1 from public.course_enrollments e where e.course_id=target_course and e.student_id=auth.uid())
$$;
create or replace function public.can_teach_course(target_course uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(select 1 from public.courses c where c.id=target_course and c.teacher_id=auth.uid())
$$;
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create or replace function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,email,full_name) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name','')); return new; end $$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.on_auth_user_created();
do $$ declare t text; begin foreach t in array array['profiles','courses','resources','assignments','quizzes','announcements','complaints'] loop
 execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t);
end loop; end $$;

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.resources enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.marks enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.complaints enable row level security;

create policy roles_read on public.roles for select to authenticated using(true);
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin() or exists(select 1 from public.course_enrollments e where e.student_id=profiles.id and public.is_course_member(e.course_id)));
create policy profiles_update_self on public.profiles for update to authenticated using(id=auth.uid() or public.is_admin()) with check(id=auth.uid() or public.is_admin());
create policy courses_read on public.courses for select to authenticated using(public.is_admin() or teacher_id=auth.uid() or exists(select 1 from public.course_enrollments e where e.course_id=courses.id and e.student_id=auth.uid()));
create policy courses_admin_write on public.courses for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy enrollments_read on public.course_enrollments for select to authenticated using(public.is_admin() or student_id=auth.uid() or exists(select 1 from public.courses c where c.id=course_id and c.teacher_id=auth.uid()));
create policy enrollments_admin_write on public.course_enrollments for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy resources_read on public.resources for select to authenticated using(public.is_course_member(course_id));
create policy resources_teacher_write on public.resources for all to authenticated using(public.current_role() in ('admin','teacher') and public.is_course_member(course_id)) with check(public.current_role() in ('admin','teacher') and public.is_course_member(course_id));
create policy assignments_read on public.assignments for select to authenticated using(public.is_course_member(course_id));
create policy assignments_teacher_write on public.assignments for all to authenticated using(public.current_role() in ('admin','teacher') and public.is_course_member(course_id)) with check(public.current_role() in ('admin','teacher') and public.is_course_member(course_id));
create policy submissions_read on public.submissions for select to authenticated using(student_id=auth.uid() or public.is_admin() or exists(select 1 from public.assignments a join public.courses c on c.id=a.course_id where a.id=assignment_id and c.teacher_id=auth.uid()));
create policy submissions_student_insert on public.submissions for insert to authenticated with check(student_id=auth.uid() and exists(select 1 from public.assignments a join public.course_enrollments e on e.course_id=a.course_id where a.id=assignment_id and e.student_id=auth.uid()));
create policy submissions_student_update on public.submissions for update to authenticated using(student_id=auth.uid() and marks_awarded is null) with check(student_id=auth.uid());
create policy submissions_teacher_grade on public.submissions for update to authenticated using(public.current_role() in ('admin','teacher')) with check(public.current_role() in ('admin','teacher'));
create policy quizzes_read on public.quizzes for select to authenticated using(public.is_course_member(course_id));
create policy quizzes_teacher_write on public.quizzes for all to authenticated using(public.current_role() in ('admin','teacher') and public.is_course_member(course_id)) with check(public.current_role() in ('admin','teacher') and public.is_course_member(course_id));
create policy questions_read on public.questions for select to authenticated using(exists(select 1 from public.quizzes q where q.id=quiz_id and public.is_course_member(q.course_id)));
create policy questions_teacher_write on public.questions for all to authenticated using(public.current_role() in ('admin','teacher') and exists(select 1 from public.quizzes q where q.id=quiz_id and public.is_course_member(q.course_id))) with check(public.current_role() in ('admin','teacher') and exists(select 1 from public.quizzes q where q.id=quiz_id and public.is_course_member(q.course_id)));
create policy attempts_read on public.quiz_attempts for select to authenticated using(student_id=auth.uid() or public.is_admin() or exists(select 1 from public.quizzes q join public.courses c on c.id=q.course_id where q.id=quiz_id and c.teacher_id=auth.uid()));
create policy attempts_insert on public.quiz_attempts for insert to authenticated with check(student_id=auth.uid() and exists(select 1 from public.quizzes q join public.course_enrollments e on e.course_id=q.course_id where q.id=quiz_id and e.student_id=auth.uid()));
create policy marks_read on public.marks for select to authenticated using(student_id=auth.uid() or public.is_admin() or exists(select 1 from public.courses c where c.id=course_id and c.teacher_id=auth.uid()));
create policy marks_teacher_write on public.marks for all to authenticated using(public.current_role() in ('admin','teacher') and public.is_course_member(course_id)) with check(public.current_role() in ('admin','teacher') and public.is_course_member(course_id));
create policy announcements_read on public.announcements for select to authenticated using(is_global or (course_id is not null and public.is_course_member(course_id)));
create policy announcements_teacher_write on public.announcements for all to authenticated using(public.current_role() in ('admin','teacher') and (course_id is null or public.is_course_member(course_id))) with check(public.current_role() in ('admin','teacher') and (course_id is null or public.is_course_member(course_id)));
create policy announcement_reads_self on public.announcement_reads for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy chat_read on public.chat_messages for select to authenticated using(public.is_course_member(course_id));
create policy chat_insert on public.chat_messages for insert to authenticated with check(sender_id=auth.uid() and public.is_course_member(course_id));
create policy chat_moderate on public.chat_messages for delete to authenticated using(public.current_role() in ('admin','teacher') and public.is_course_member(course_id));
create policy complaints_read on public.complaints for select to authenticated using(student_id=auth.uid() or public.is_admin());
create policy complaints_insert on public.complaints for insert to authenticated with check(student_id=auth.uid());
create policy complaints_admin_update on public.complaints for update to authenticated using(public.is_admin()) with check(public.is_admin());

-- Remove quiz answer keys from browser-readable columns. Grading is performed by the trusted API.
revoke select on public.questions from authenticated;
grant select(id,quiz_id,prompt,question_type,options,points,position) on public.questions to authenticated;
-- Keep account roles and grading fields out of users' writable columns.
revoke update on public.profiles from authenticated;
grant update(full_name,department,avatar_url) on public.profiles to authenticated;
revoke insert,update on public.submissions from authenticated;
grant insert(assignment_id,student_id,text_response,file_path,submitted_at),update(student_id,text_response,file_path,submitted_at) on public.submissions to authenticated;
revoke insert,update on public.quiz_attempts from authenticated;
revoke insert,update on public.complaints from authenticated;
grant insert(student_id,category,subject,description,attachment_path) on public.complaints to authenticated;
drop policy if exists resources_teacher_write on public.resources;
create policy resources_teacher_write on public.resources for all to authenticated using(public.can_teach_course(course_id)) with check(public.can_teach_course(course_id));
drop policy if exists assignments_teacher_write on public.assignments;
create policy assignments_teacher_write on public.assignments for all to authenticated using(public.can_teach_course(course_id)) with check(public.can_teach_course(course_id));
drop policy if exists quizzes_teacher_write on public.quizzes;
create policy quizzes_teacher_write on public.quizzes for all to authenticated using(public.can_teach_course(course_id)) with check(public.can_teach_course(course_id));
drop policy if exists questions_teacher_write on public.questions;
create policy questions_teacher_write on public.questions for all to authenticated using(public.current_role()='admin' or (public.current_role()='teacher' and exists(select 1 from public.quizzes q where q.id=quiz_id and public.can_teach_course(q.course_id)))) with check(public.current_role()='admin' or (public.current_role()='teacher' and exists(select 1 from public.quizzes q where q.id=quiz_id and public.can_teach_course(q.course_id))));
drop policy if exists submissions_teacher_grade on public.submissions;
create policy submissions_teacher_grade on public.submissions for update to authenticated using(public.is_admin() or (public.current_role()='teacher' and exists(select 1 from public.assignments a where a.id=assignment_id and public.can_teach_course(a.course_id)))) with check(public.is_admin() or (public.current_role()='teacher' and exists(select 1 from public.assignments a where a.id=assignment_id and public.can_teach_course(a.course_id))));
drop policy if exists marks_teacher_write on public.marks;
create policy marks_teacher_write on public.marks for all to authenticated using(public.is_admin() or (public.current_role()='teacher' and public.can_teach_course(course_id))) with check(public.is_admin() or (public.current_role()='teacher' and public.can_teach_course(course_id)));
drop policy if exists announcements_teacher_write on public.announcements;
create policy announcements_teacher_write on public.announcements for all to authenticated using(public.is_admin() or (public.current_role()='teacher' and course_id is not null and public.can_teach_course(course_id))) with check(public.is_admin() or (public.current_role()='teacher' and course_id is not null and public.can_teach_course(course_id)));
drop policy if exists chat_moderate on public.chat_messages;
create policy chat_moderate on public.chat_messages for delete to authenticated using(public.is_admin() or (public.current_role()='teacher' and public.can_teach_course(course_id)));

-- Private buckets; access is enforced by enrollment-aware Storage policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('course-resources','course-resources',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp']),
 ('assignment-files','assignment-files',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp','text/plain']),
 ('complaint-files','complaint-files',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']),
 ('avatars','avatars',false,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy enrolled_resource_download on storage.objects for select to authenticated using(bucket_id='course-resources' and public.is_course_member((storage.foldername(name))[1]::uuid));
create policy teacher_resource_upload on storage.objects for insert to authenticated with check(bucket_id='course-resources' and public.current_role() in ('admin','teacher') and public.is_course_member((storage.foldername(name))[1]::uuid));
create policy teacher_resource_delete on storage.objects for delete to authenticated using(bucket_id='course-resources' and public.current_role() in ('admin','teacher') and public.is_course_member((storage.foldername(name))[1]::uuid));
create policy owner_assignment_files on storage.objects for all to authenticated using(bucket_id='assignment-files' and (owner_id=auth.uid()::text or public.is_admin())) with check(bucket_id='assignment-files' and (owner_id=auth.uid()::text or public.is_admin()));
create policy owner_complaint_files on storage.objects for all to authenticated using(bucket_id='complaint-files' and (owner_id=auth.uid()::text or public.is_admin())) with check(bucket_id='complaint-files' and (owner_id=auth.uid()::text or public.is_admin()));
create policy owner_avatar_files on storage.objects for all to authenticated using(bucket_id='avatars' and (owner_id=auth.uid()::text or public.is_admin())) with check(bucket_id='avatars' and (owner_id=auth.uid()::text or public.is_admin()));

-- Realtime listeners still receive only rows allowed by chat_messages RLS.
alter publication supabase_realtime add table public.chat_messages;
