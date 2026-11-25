/**
 * SAMPLE / DEMO academic data. Entirely fictional. NOT official GU Tech course, timetable or grading information.
 * All ids are deterministic (uuid derived from a name) so seeding is idempotent: re-running upserts the same rows.
 */
import { createHash } from 'node:crypto';

export const DEMO_DOMAIN = 'demo.gutech.local';
export const DEMO_ACCOUNTS = {
  student: { roll: 'DEMO-2024-001', email: `demo.student@${DEMO_DOMAIN}`, password: 'DemoStudent#2024', name: 'Demo Student' },
  admin: { email: `admin@${DEMO_DOMAIN}`, password: 'DemoAdmin#2024x', name: 'Demo Administrator' },
  teacher: { email: `teacher@${DEMO_DOMAIN}`, password: 'DemoTeacher#2024', name: 'Demo Instructor (Programming)' },
};

export const uid = (name: string) => {
  const h = createHash('sha1').update(`gutech-demo:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const rand = (key: string) => parseInt(createHash('sha1').update(key).digest('hex').slice(0, 8), 16) / 0xffffffff; // deterministic 0..1
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

export type SeedUser = { id: string; email: string; password: string; full_name: string; role: 'admin' | 'teacher' | 'student'; roll_number?: string; program?: string; department?: string; semester?: number };

export function buildSeed(now = new Date()) {
  const admin: SeedUser = { id: uid('admin'), ...DEMO_ACCOUNTS.admin, full_name: DEMO_ACCOUNTS.admin.name, role: 'admin', department: 'School of Technology' };
  const teachers: SeedUser[] = [
    { id: uid('teacher1'), ...DEMO_ACCOUNTS.teacher, full_name: DEMO_ACCOUNTS.teacher.name, role: 'teacher', department: 'School of Technology' },
    { id: uid('teacher2'), email: `teacher2@${DEMO_DOMAIN}`, password: 'DemoTeacher#2024', full_name: 'Demo Instructor (Sciences)', role: 'teacher', department: 'School of Technology' },
    { id: uid('teacher3'), email: `teacher3@${DEMO_DOMAIN}`, password: 'DemoTeacher#2024', full_name: 'Demo Instructor (Humanities)', role: 'teacher', department: 'School of Technology' },
  ];
  const names = ['Demo Student', 'Demo Student Two', 'Demo Student Three', 'Demo Student Four', 'Demo Student Five', 'Demo Student Six', 'Demo Student Seven', 'Demo Student Eight'];
  const students: SeedUser[] = names.map((n, i) => ({
    id: uid(`student${i + 1}`), email: i === 0 ? DEMO_ACCOUNTS.student.email : `demo.student${i + 1}@${DEMO_DOMAIN}`, password: i === 0 ? DEMO_ACCOUNTS.student.password : 'DemoStudent#2024',
    full_name: n, role: 'student', roll_number: `DEMO-2024-${String(i + 1).padStart(3, '0')}`, program: 'BS Computer Science (DEMO)', department: 'School of Technology', semester: 1,
  }));
  const users = [admin, ...teachers, ...students];

  const C = (key: string, code: string, title: string, credit: number, t: number, desc: string) => ({ id: uid(`course:${key}`), code, title, credit_hours: credit, teacher_id: teachers[t].id, semester: 1, program: 'BS Computer Science (DEMO)', description: `SAMPLE: ${desc}`, is_global: false, created_by: admin.id });
  const courses = [
    C('pf', 'CS-101', 'Programming Fundamentals', 3, 0, 'Introduction to problem solving and programming with loops, functions and arrays.'),
    C('ic', 'CS-102', 'Introduction to Computing', 3, 0, 'Overview of computer systems, number systems, networks and software.'),
    C('dm', 'MT-102', 'Discrete Mathematics', 3, 1, 'Logic, sets, relations, functions and counting techniques.'),
    C('en', 'HU-101', 'English', 2, 2, 'Functional English: reading, writing and presentation skills.'),
    C('ap', 'PH-101', 'Applied Physics', 3, 1, 'Mechanics, waves and basic electricity for computing students.'),
  ];
  const cid = (key: string) => uid(`course:${key}`);

  const enrollments = students.flatMap(s => courses.map(c => ({ id: uid(`enr:${s.id}:${c.id}`), course_id: c.id, student_id: s.id, enrolled_by: admin.id })));

  // [course, day(0=Sun), start, end, room]
  const slotDefs: [string, number, string, string, string][] = [
    ['pf', 1, '09:00', '10:30', 'B-101'], ['ap', 1, '11:00', '12:30', 'A-207'],
    ['dm', 2, '09:00', '10:30', 'A-204'], ['en', 2, '11:00', '12:00', 'A-110'], ['ic', 2, '14:00', '15:30', 'B-102'],
    ['pf', 3, '09:00', '11:00', 'Lab-1'], ['ap', 3, '11:30', '13:00', 'A-207'],
    ['ic', 4, '09:00', '10:30', 'B-102'], ['dm', 4, '11:00', '12:30', 'A-204'], ['en', 4, '14:00', '15:00', 'A-110'],
    ['pf', 5, '09:00', '10:30', 'B-101'], ['ic', 5, '11:00', '12:00', 'B-102'], ['ap', 5, '14:00', '15:30', 'A-207'],
  ];
  const timetable_slots = slotDefs.map(([k, day, s, e, room]) => ({ id: uid(`slot:${k}:${day}:${s}`), course_id: cid(k), day_of_week: day, start_time: `${s}:00`, end_time: `${e}:00`, room, created_by: admin.id }));

  // attendance: every scheduled session in the 8 weeks before today (today excluded)
  const attendance: Record<string, unknown>[] = [];
  for (let back = 1; back <= 56; back++) {
    const date = addDays(now, -back), dstr = isoDay(date), dow = date.getUTCDay();
    for (const slot of timetable_slots.filter(s => s.day_of_week === dow)) {
      for (const st of students) {
        const r = rand(`att:${st.id}:${slot.course_id}:${dstr}`);
        const base = st.roll_number === 'DEMO-2024-001' ? 0 : (parseInt(st.id.slice(0, 2), 16) % 5) * 0.03;
        const status = r < 0.78 - base ? 'present' : r < 0.82 - base ? 'late' : r < 0.94 ? 'absent' : 'leave';
        attendance.push({ id: uid(`att:${st.id}:${slot.course_id}:${dstr}`), course_id: slot.course_id, student_id: st.id, attended_on: dstr, status, marked_by: courses.find(c => c.id === slot.course_id)!.teacher_id });
      }
    }
  }

  const A = (key: string, course: string, title: string, desc: string, dueIn: number, max: number) => ({ id: uid(`asg:${key}`), course_id: cid(course), title, description: `SAMPLE: ${desc}`, due_at: new Date(addDays(now, dueIn).setUTCHours(18, 59, 0, 0)).toISOString(), max_marks: max, created_by: courses.find(c => c.id === cid(course))!.teacher_id, created_at: addDays(now, dueIn - 14).toISOString() });
  const assignments = [
    A('pf1', 'pf', 'Assignment 1: Variables and Loops', 'Write programs that use variables, conditions and loops.', -10, 20),
    A('pf2', 'pf', 'Assignment 2: Functions', 'Implement and test small reusable functions.', 3, 20),
    A('ic1', 'ic', 'Report: History of Computing', 'A two-page report on one milestone in computing.', 6, 10),
    A('dm1', 'dm', 'Problem Set 1: Logic', 'Truth tables and logical equivalences.', -5, 20),
    A('dm2', 'dm', 'Problem Set 2: Sets', 'Set operations and Venn diagrams.', 2, 20),
    A('en1', 'en', 'Essay: My University', 'A 400-word descriptive essay.', 5, 10),
    A('ap1', 'ap', 'Lab Report 1', 'Report on the pendulum experiment.', -3, 20),
  ];
  const demoStudent = students[0];
  const submissions = [
    { key: 'pf1', text: 'SAMPLE submission: solutions to all five questions attached in the text of this response.', marks: 17, fb: 'SAMPLE feedback: good work, watch loop boundaries.' },
    { key: 'dm1', text: 'SAMPLE submission: truth tables for questions 1-6.', marks: null, fb: null },
  ].map(s => {
    const a = assignments.find(x => x.id === uid(`asg:${s.key}`))!;
    return { id: uid(`sub:${s.key}:${demoStudent.id}`), assignment_id: a.id, student_id: demoStudent.id, text_response: s.text, submitted_at: addDays(new Date(a.due_at), -1).toISOString(), marks_awarded: s.marks, feedback: s.fb, graded_by: s.marks != null ? a.created_by : null, graded_at: s.marks != null ? addDays(new Date(a.due_at), 2).toISOString() : null };
  });

  const assessments: [string, number, number][] = [['Quiz 1', 10, 10], ['Assignment 1', 20, 15], ['Midterm Exam', 50, 30]]; // name, max, weightage
  const marks: Record<string, unknown>[] = [];
  for (const c of courses) for (const s of students) for (const [name, max, w] of assessments) {
    const r = rand(`mk:${s.id}:${c.id}:${name}`);
    const lo = s.roll_number === 'DEMO-2024-001' ? 0.68 : 0.45;
    marks.push({ id: uid(`mk:${s.id}:${c.id}:${name}`), student_id: s.id, course_id: c.id, assessment: name, score: Math.round(max * (lo + r * (0.97 - lo)) * 2) / 2, max_score: max, weightage: w, feedback: null, entered_by: c.teacher_id, created_at: addDays(now, -20).toISOString() });
  }

  const announcements = [
    { id: uid('ann1'), course_id: null, title: 'SAMPLE: Welcome to the DEMO semester', body: 'SAMPLE: This is demonstration data. Orientation notes and portal tips will appear here.', is_global: true, created_by: admin.id, created_at: addDays(now, -9).toISOString() },
    { id: uid('ann2'), course_id: null, title: 'SAMPLE: Midterm examination schedule', body: 'SAMPLE: The DEMO midterm schedule has been published. Check your timetable for room changes.', is_global: true, created_by: admin.id, created_at: addDays(now, -2).toISOString() },
    { id: uid('ann3'), course_id: cid('pf'), title: 'SAMPLE: Lab session moved to Lab-1', body: 'SAMPLE: This Wednesday\'s Programming Fundamentals lab takes place in Lab-1.', is_global: false, created_by: teachers[0].id, created_at: addDays(now, -1).toISOString() },
  ];
  const resourceDefs = courses.flatMap(c => [
    { id: uid(`res:${c.id}:outline`), course_id: c.id, title: 'SAMPLE: Course outline', file_name: `${c.code}-outline.txt`, text: `SAMPLE DOCUMENT\n${c.code} ${c.title}\nCredit hours: ${c.credit_hours}\nThis is demo content, not an official GU Tech course outline.\n` },
    { id: uid(`res:${c.id}:notes`), course_id: c.id, title: 'SAMPLE: Week 1 notes', file_name: `${c.code}-week1-notes.txt`, text: `SAMPLE DOCUMENT\nWeek 1 notes for ${c.title}.\nThis is demo content.\n` },
  ]);
  const resources = resourceDefs.map(r => ({ id: r.id, course_id: r.course_id, title: r.title, description: 'SAMPLE material', file_path: `${r.course_id}/${r.file_name}`, file_name: r.file_name, file_size: r.text.length, mime_type: 'text/plain', created_by: courses.find(c => c.id === r.course_id)!.teacher_id }));
  const files: Record<string, string> = Object.fromEntries(resourceDefs.map(r => [`${r.course_id}/${r.file_name}`, r.text]));

  return { users, tables: { courses, course_enrollments: enrollments, timetable_slots, attendance, assignments, submissions, marks, announcements, resources }, files };
}
