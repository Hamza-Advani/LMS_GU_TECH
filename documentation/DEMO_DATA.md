# Demo (SAMPLE) data

Everything here is fictional and labelled SAMPLE/DEMO. It is **not** official GU Tech information (course codes, timetable, rooms, instructors, weightages and the grading scale are illustrative) and contains no real student data. It lives only in the local demo database (`backend/.demo-data/`, git-ignored) unless you deliberately run `npm run seed:supabase`.

## What `seed:demo` / `reset:demo` creates (stable ids; re-running upserts, never duplicates)
| Table | Rows | Notes |
|---|---|---|
| users/profiles | 12 | 1 admin, 3 teachers, 8 students (`DEMO-2024-001..008`, program "BS Computer Science (DEMO)", semester 1) |
| courses | 5 | CS-101 Programming Fundamentals (3), CS-102 Introduction to Computing (3), MT-102 Discrete Mathematics (3), HU-101 English (2), PH-101 Applied Physics (3) = 14 credit hours |
| course_enrollments | 40 | every student in every course |
| timetable_slots | 13 | Monday to Friday; none on weekends |
| attendance | 832 | every scheduled session in the 8 weeks before the seed date, deterministic per student (the demo student is about 79%) |
| assignments / submissions | 7 / 2 | 3 past, 4 upcoming; demo student has one graded and one submitted |
| marks | 120 | Quiz 1 (10, weight 10), Assignment 1 (20, weight 15), Midterm Exam (50, weight 30) per student per course |
| announcements | 3 | 2 campus-wide, 1 course |
| resources | 10 | 2 small text files per course |

DEMO grading scale (`backend/src/lib/academics.ts`): A >= 85, A- 80, B+ 75, B 70, B- 65, C+ 60, C 55, D 50, F below. Attendance warning threshold: 75%.

## Reset semantics
- `npm run reset:demo` deletes the local demo database file and uploaded demo files and reseeds. It cannot reach Supabase.
- `npm run seed:demo` only upserts seeded ids; records you created through the UI are kept.
- `npm run seed:supabase -- --reset` (unverified, needs service-role key in `backend/.env`) deletes only rows whose ids come from this seed and auth users ending in `@demo.gutech.local`; real academic records are never targeted.
