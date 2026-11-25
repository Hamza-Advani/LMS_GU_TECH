import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {authenticate,allowRoles} from '../middleware/auth.js';
import {route} from '../lib/route.js';
import {scopedDb} from '../lib/db.js';
import {adminDb,authDb} from '../supabase.js';
import {env} from '../config.js';
import {DEMO,getStore} from '../demo/index.js';
import {DEMO_ACCOUNTS} from '../demo/seedData.js';
import {courseResult,nextSlot,nowIn,summarizeAttendance,pct,GRADE_SCALE} from '../lib/academics.js';

export const gutechRouter=Router();
const idSchema=z.string().uuid();
const rollSchema=z.string().trim().regex(/^[A-Za-z0-9\-/]{3,30}$/);
const GENERIC_LOGIN_ERROR='Invalid roll number or password.';
const authLimiter=rateLimit({windowMs:15*60_000,limit:DEMO?200:20,standardHeaders:'draft-7',legacyHeaders:false,message:{message:'Too many attempts. Please try again later.'}});
const TZ=process.env.INSTITUTE_TZ||'Asia/Karachi';
const fail=(res:any,error:{message:string;code?:string},status=400)=>res.status(error.code==='PGRST116'?404:error.code==='23505'?409:status).json({message:error.message});
const one=<T,>(v:T|T[]|null|undefined)=>Array.isArray(v)?v[0]:v;

/** Public: lets the UI show a DEMO banner and (demo only) the documented demo logins. */
gutechRouter.get('/meta',(_req,res)=>res.json({demo:DEMO,gradeScale:GRADE_SCALE,timezone:TZ,demoAccounts:DEMO?{student:{roll:DEMO_ACCOUNTS.student.roll,password:DEMO_ACCOUNTS.student.password},admin:{email:DEMO_ACCOUNTS.admin.email,password:DEMO_ACCOUNTS.admin.password}}:undefined}));

// ---------------- authentication ----------------
/** Resolve a login identifier (roll number, or email for staff) to an auth email. Never reveals whether it exists. */
async function resolveEmail(identifier:string):Promise<string|null>{
  if(identifier.includes('@'))return z.string().email().safeParse(identifier).success?identifier.toLowerCase():null;
  const roll=rollSchema.safeParse(identifier);if(!roll.success)return null;
  const {data}=await adminDb.from('profiles').select('email').ilike('roll_number',roll.data).maybeSingle();
  return data?.email??null;
}
gutechRouter.post('/auth/login',authLimiter,route(async(req,res)=>{
  const s=z.object({identifier:z.string().trim().min(3).max(120),password:z.string().min(1).max(200)}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:'Enter your roll number and password.'});
  const email=await resolveEmail(s.data.identifier);
  if(!email)return res.status(401).json({message:GENERIC_LOGIN_ERROR});
  const {data,error}=await authDb.auth.signInWithPassword({email,password:s.data.password});
  if(error||!data.session)return res.status(401).json({message:GENERIC_LOGIN_ERROR});
  res.json({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
}));
gutechRouter.post('/auth/forgot',authLimiter,route(async(req,res)=>{
  const s=z.object({identifier:z.string().trim().min(3).max(120),redirectTo:z.string().url().optional()}).safeParse(req.body);
  if(s.success){
    const email=await resolveEmail(s.data.identifier);
    const redirect=s.data.redirectTo&&new URL(s.data.redirectTo).origin===new URL(env.FRONTEND_ORIGIN).origin?s.data.redirectTo:`${env.FRONTEND_ORIGIN}/reset-password`;
    if(email)await authDb.auth.resetPasswordForEmail(email,{redirectTo:redirect});
  }
  res.json({message:'If that account exists, a reset link has been sent to its registered email.'});
}));

// ---------------- courses ----------------
type Course={id:string;code:string;title:string;description?:string|null;credit_hours:number;semester?:number|null;program?:string|null;teacher_id?:string|null};
async function withInstructors(courses:Course[]){
  const ids=[...new Set(courses.map(c=>c.teacher_id).filter(Boolean))] as string[];
  const names=new Map<string,string>();
  if(ids.length){const {data}=await adminDb.from('profiles').select('id,full_name').in('id',ids);for(const p of data||[])names.set(p.id,p.full_name)} // only the display name is exposed
  return courses.map(({teacher_id,...c})=>({...c,instructor:teacher_id?names.get(teacher_id)??null:null}));
}
gutechRouter.get('/courses',authenticate,route(async(req,res)=>{
  const {data,error}=await scopedDb(req).from('courses').select('*').order('code');
  if(error)return fail(res,error);
  const withNames=await withInstructors((data||[]) as Course[]);
  // staff who manage courses need the raw instructor id to edit assignments
  res.json(req.profile!.role==='admin'?withNames.map((c,i)=>({...c,teacher_id:(data as Course[])[i].teacher_id??null})):withNames);
}));
gutechRouter.get('/admin/teachers',authenticate,allowRoles('admin'),route(async(_req,res)=>{
  const {data,error}=await adminDb.from('profiles').select('id,full_name').eq('role','teacher').order('full_name');
  if(error)return fail(res,error);res.json(data);
}));
gutechRouter.get('/courses/:id/overview',authenticate,route(async(req,res)=>{
  const db=scopedDb(req),me=req.profile!;
  const {data:course,error}=await db.from('courses').select('*').eq('id',req.params.id).maybeSingle();
  if(error)return fail(res,error);if(!course)return res.status(404).json({message:'Course not found.'});
  const [{data:att},{data:marks},{data:slots}]=await Promise.all([
    db.from('attendance').select('course_id,status,attended_on').eq('course_id',course.id).eq('student_id',me.id).order('attended_on',{ascending:false}),
    db.from('marks').select('id,score,max_score,weightage,assessment,created_at,assignments(title)').eq('course_id',course.id).eq('student_id',me.id).order('created_at'),
    db.from('timetable_slots').select('id,day_of_week,start_time,end_time,room').eq('course_id',course.id).order('day_of_week').order('start_time')
  ]);
  const a=summarizeAttendance(att||[]);
  const [c]=await withInstructors([course as Course]);
  res.json({course:c,slots:slots||[],attendance:{percentage:a.percentage,attended:a.attended,total:a.total,recent:(att||[]).slice(0,8)},
    marks:(marks||[]).map((m:any)=>({...m,assessment:m.assessment||one(m.assignments)?.title||'Assessment',assignments:undefined})),result:courseResult(marks||[])});
}));

// ---------------- dashboard ----------------
type Slot={id:string;course_id:string;day_of_week:number;start_time:string;end_time:string;room:string|null;courses?:{code:string;title:string}|{code:string;title:string}[]|null};
gutechRouter.get('/dashboard',authenticate,route(async(req,res)=>{
  const db=scopedDb(req),me=req.profile!;
  const nowIso=new Date().toISOString(),horizon=new Date(Date.now()+14*864e5).toISOString();
  const [c,s,a,an,as,sub,mk]=await Promise.all([
    db.from('courses').select('id,code,title,credit_hours,teacher_id').order('code'),
    db.from('timetable_slots').select('id,course_id,day_of_week,start_time,end_time,room,courses(code,title)'),
    db.from('attendance').select('course_id,status').eq('student_id',me.id),
    db.from('announcements').select('id,title,body,created_at').order('created_at',{ascending:false}).limit(3),
    db.from('assignments').select('id,title,due_at,courses(code)').gte('due_at',nowIso).lte('due_at',horizon).order('due_at').limit(6),
    db.from('submissions').select('assignment_id,marks_awarded,submitted_at,assignments(title)').eq('student_id',me.id).order('submitted_at',{ascending:false}).limit(5),
    db.from('marks').select('assessment,score,max_score,created_at,courses(code)').eq('student_id',me.id).order('created_at',{ascending:false}).limit(5)
  ]);
  const err=[c,s,a,an,as,sub,mk].find(r=>r.error)?.error;if(err)return fail(res,err);
  const now=nowIn(TZ);
  const slots=(s.data||[]) as Slot[];
  const today=slots.filter(x=>x.day_of_week===now.day).sort((x,y)=>x.start_time.localeCompare(y.start_time));
  const nx=nextSlot(slots,now);
  const inst=new Map((await withInstructors((c.data||[]) as Course[])).map(x=>[x.id,x.instructor]));
  const att=summarizeAttendance(a.data||[]);
  const submitted=new Set((sub.data||[]).map((x:any)=>x.assignment_id));
  const activity=[
    ...(mk.data||[]).map((m:any)=>({type:'result',title:`${one(m.courses)?.code??''} ${m.assessment??'Result'}: ${m.score}/${m.max_score}`,at:m.created_at})),
    ...(sub.data||[]).map((x:any)=>({type:'submission',title:`Submitted ${one(x.assignments)?.title??'assignment'}${x.marks_awarded!=null?` (graded ${x.marks_awarded})`:''}`,at:x.submitted_at}))
  ].sort((x,y)=>String(y.at).localeCompare(String(x.at))).slice(0,5);
  const ref=(x:Slot)=>({id:x.id,code:one(x.courses)?.code,title:one(x.courses)?.title,start:x.start_time,end:x.end_time,room:x.room,instructor:inst.get(x.course_id)??null});
  res.json({
    totals:{courses:c.data?.length||0,creditHours:(c.data||[]).reduce((n:number,x:any)=>n+Number(x.credit_hours||0),0)},
    classesToday:today.map(ref),
    nextClass:nx&&{...ref(nx.slot),day:nx.slot.day_of_week,daysAhead:nx.daysAhead},
    attendance:{percentage:att.percentage,attended:att.attended,total:att.total},
    announcements:an.data||[],
    upcomingAssignments:(as.data||[]).map((x:any)=>({id:x.id,title:x.title,due_at:x.due_at,code:one(x.courses)?.code,submitted:submitted.has(x.id)})),
    recentActivity:activity
  });
}));

// ---------------- timetable ----------------
gutechRouter.get('/timetable',authenticate,route(async(req,res)=>{
  const db=scopedDb(req);
  const [{data,error},{data:cs}]=await Promise.all([
    db.from('timetable_slots').select('id,course_id,day_of_week,start_time,end_time,room,courses(code,title)').order('day_of_week').order('start_time'),
    db.from('courses').select('id,teacher_id')
  ]);
  if(error)return fail(res,error);
  const inst=new Map((await withInstructors((cs||[]).map((x:any)=>({...x,code:'',title:'',credit_hours:0})) as Course[])).map(x=>[x.id,x.instructor]));
  res.json((data||[]).map((x:any)=>({...x,instructor:inst.get(x.course_id)??null})));
}));
const timeStr=z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const slotSchema=z.object({course_id:idSchema,day_of_week:z.number().int().min(0).max(6),start_time:timeStr,end_time:timeStr,room:z.string().max(60).nullable().optional()}).refine(x=>x.end_time>x.start_time,{message:'End time must be after start time.'});
gutechRouter.post('/timetable',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const s=slotSchema.safeParse(req.body);if(!s.success)return res.status(400).json({message:s.error.issues[0]?.message||'Check the timetable fields.'});
  const {data,error}=await scopedDb(req).from('timetable_slots').insert({...s.data,created_by:req.profile!.id}).select().single();
  if(error)return fail(res,error);res.status(201).json(data);
}));
gutechRouter.patch('/timetable/:id',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const s=slotSchema.safeParse(req.body);if(!s.success)return res.status(400).json({message:s.error.issues[0]?.message||'Check the timetable fields.'});
  const {data,error}=await scopedDb(req).from('timetable_slots').update(s.data).eq('id',req.params.id).select().single();
  if(error)return fail(res,error);res.json(data);
}));
gutechRouter.delete('/timetable/:id',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const {error}=await scopedDb(req).from('timetable_slots').delete().eq('id',req.params.id);
  if(error)return fail(res,error);res.status(204).end();
}));

// ---------------- attendance ----------------
gutechRouter.get('/attendance',authenticate,route(async(req,res)=>{
  const db=scopedDb(req);
  const [{data:rows,error},{data:courses}]=await Promise.all([
    db.from('attendance').select('id,course_id,attended_on,status').eq('student_id',req.profile!.id).order('attended_on',{ascending:false}).limit(1000),
    db.from('courses').select('id,code,title').order('code')
  ]);
  if(error)return fail(res,error);
  const a=summarizeAttendance(rows||[]);
  res.json({
    overall:{percentage:a.percentage,attended:a.attended,total:a.total},
    courses:(courses||[]).map((c:any)=>{const e=a.byCourse.get(c.id)??{total:0,attended:0};return {...c,total:e.total,attended:e.attended,percentage:pct(e.attended,e.total)}}),
    history:(rows||[]).slice(0,300)
  });
}));
/** Existing records for a course/date so staff can edit a previous sheet. */
gutechRouter.get('/attendance/sheet',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const q=z.object({course_id:idSchema,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).safeParse(req.query);if(!q.success)return res.status(400).json({message:'Choose a course and date.'});
  const {data,error}=await scopedDb(req).from('attendance').select('student_id,status').eq('course_id',q.data.course_id).eq('attended_on',q.data.date);
  if(error)return fail(res,error);res.json(data);
}));
gutechRouter.post('/attendance',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const s=z.object({course_id:idSchema,attended_on:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),records:z.array(z.object({student_id:idSchema,status:z.enum(['present','absent','late','leave'])})).min(1).max(500)}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:'Check the attendance details.'});
  if(s.data.attended_on>new Date().toISOString().slice(0,10))return res.status(400).json({message:'Attendance cannot be marked for a future date.'});
  const rows=s.data.records.map(r=>({course_id:s.data.course_id,attended_on:s.data.attended_on,student_id:r.student_id,status:r.status,marked_by:req.profile!.id}));
  const {data,error}=await scopedDb(req).from('attendance').upsert(rows,{onConflict:'course_id,student_id,attended_on'}).select('id');
  if(error)return fail(res,error);res.status(201).json({saved:data?.length||0});
}));

// ---------------- results ----------------
gutechRouter.get('/results',authenticate,route(async(req,res)=>{
  const {data,error}=await scopedDb(req).from('marks').select('id,score,max_score,weightage,feedback,assessment,created_at,course_id,courses(id,code,title,credit_hours),assignments(title)').eq('student_id',req.profile!.id).order('created_at').limit(1000);
  if(error)return fail(res,error);
  const by=new Map<string,any>();
  for(const m of (data||[]) as any[]){const c=one(m.courses);if(!c)continue;const g=by.get(c.id)??{course:c,items:[]};g.items.push({id:m.id,assessment:m.assessment||one(m.assignments)?.title||'Assessment',score:Number(m.score),max_score:Number(m.max_score),weightage:m.weightage==null?null:Number(m.weightage),feedback:m.feedback,created_at:m.created_at});by.set(c.id,g)}
  const courses=[...by.values()].map(g=>({...g,result:courseResult(g.items)})).sort((a,b)=>a.course.code.localeCompare(b.course.code));
  const graded=courses.filter(c=>c.result.points!=null);
  const cr=graded.reduce((n,c)=>n+Number(c.course.credit_hours||0),0);
  res.json({courses,gpa:cr?Math.round(graded.reduce((n,c)=>n+c.result.points*Number(c.course.credit_hours||0),0)/cr*100)/100:null,gradingNote:DEMO?'DEMO grading scale. Not the official GU Tech policy.':'Grades use the configured grading scale.'});
}));
const markFields={assessment:z.string().trim().min(2).max(120),score:z.number().min(0),max_score:z.number().positive(),weightage:z.number().positive().max(100).nullable().optional(),feedback:z.string().max(5000).nullable().optional()};
const notOver=(x:{score:number;max_score:number})=>x.score<=x.max_score;
gutechRouter.get('/results/manage',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const cid=idSchema.safeParse(req.query.course_id);if(!cid.success)return res.status(400).json({message:'Choose a course.'});
  const {data,error}=await scopedDb(req).from('marks').select('id,student_id,assessment,score,max_score,weightage,feedback,created_at,profiles(full_name,roll_number)').eq('course_id',cid.data).order('created_at',{ascending:false}).limit(500);
  if(error)return fail(res,error);res.json(data);
}));
gutechRouter.post('/results',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const s=z.object({student_id:idSchema,course_id:idSchema,...markFields}).refine(notOver,{message:'Obtained marks cannot exceed the maximum marks.'}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:s.error.issues[0]?.message||'Enter valid result details.'});
  const {data,error}=await scopedDb(req).from('marks').insert({...s.data,entered_by:req.profile!.id}).select().single();
  if(error)return fail(res,error);res.status(201).json(data);
}));
gutechRouter.patch('/results/:id',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const s=z.object(markFields).refine(notOver,{message:'Obtained marks cannot exceed the maximum marks.'}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:s.error.issues[0]?.message||'Enter valid result details.'});
  const {data,error}=await scopedDb(req).from('marks').update(s.data).eq('id',req.params.id).select().single();
  if(error)return fail(res,error);res.json(data);
}));
gutechRouter.delete('/results/:id',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const {error}=await scopedDb(req).from('marks').delete().eq('id',req.params.id);if(error)return fail(res,error);res.status(204).end();
}));

// ---------------- notifications ----------------
gutechRouter.get('/notifications',authenticate,route(async(req,res)=>{
  const db=scopedDb(req),me=req.profile!;
  const [{data:anns,error:e1},{data:reads},{data:assigns,error:e2},{data:subs}]=await Promise.all([
    db.from('announcements').select('id,title,body,course_id,is_global,created_at').order('created_at',{ascending:false}).limit(50),
    db.from('announcement_reads').select('announcement_id').eq('user_id',me.id),
    db.from('assignments').select('id,title,due_at,courses(code)').gte('due_at',new Date().toISOString()).lte('due_at',new Date(Date.now()+14*864e5).toISOString()).order('due_at'),
    db.from('submissions').select('assignment_id').eq('student_id',me.id)
  ]);
  const err=e1||e2;if(err)return fail(res,err);
  const readSet=new Set((reads||[]).map((r:any)=>r.announcement_id)),done=new Set((subs||[]).map((s:any)=>s.assignment_id));
  res.json({announcements:(anns||[]).map((a:any)=>({...a,read:readSet.has(a.id)})),deadlines:me.role==='student'?(assigns||[]).filter((a:any)=>!done.has(a.id)):[]});
}));

// ---------------- announcements (staff) ----------------
const annSchema=z.object({title:z.string().trim().min(2).max(200),body:z.string().trim().min(2).max(10000),course_id:idSchema.nullable().optional(),is_global:z.boolean().default(false)}).refine(x=>x.is_global||x.course_id,{message:'Choose a course or send to the whole campus.'});
gutechRouter.post('/announcements',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const s=annSchema.safeParse(req.body);if(!s.success)return res.status(400).json({message:s.error.issues[0]?.message||'Check the announcement.'});
  const {data,error}=await scopedDb(req).from('announcements').insert({...s.data,course_id:s.data.is_global?null:s.data.course_id,created_by:req.profile!.id}).select().single();
  if(error)return fail(res,error);res.status(201).json(data);
}));
gutechRouter.patch('/announcements/:id',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const s=annSchema.safeParse(req.body);if(!s.success)return res.status(400).json({message:s.error.issues[0]?.message||'Check the announcement.'});
  const {data,error}=await scopedDb(req).from('announcements').update({...s.data,course_id:s.data.is_global?null:s.data.course_id}).eq('id',req.params.id).select().single();
  if(error)return fail(res,error);res.json(data);
}));
gutechRouter.delete('/announcements/:id',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const {error}=await scopedDb(req).from('announcements').delete().eq('id',req.params.id);if(error)return fail(res,error);res.status(204).end();
}));

// ---------------- course materials ----------------
const ALLOWED_MIME=['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp','text/plain'];
gutechRouter.get('/resources/:id/download',authenticate,route(async(req,res)=>{
  const db=scopedDb(req);
  const {data:r,error}=await db.from('resources').select('file_path,file_name').eq('id',req.params.id).maybeSingle();
  if(error)return fail(res,error);if(!r)return res.status(404).json({message:'Material not found.'});
  const {data,error:se}=await db.storage.from('course-resources').createSignedUrl(r.file_path,60,{download:r.file_name});
  if(se||!data)return res.status(403).json({message:'You do not have access to this file.'});
  res.json({url:data.signedUrl});
}));
gutechRouter.post('/materials',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const s=z.object({course_id:idSchema,title:z.string().trim().min(2).max(200),description:z.string().max(3000).optional(),file_name:z.string().trim().min(1).max(150),mime_type:z.enum(ALLOWED_MIME as [string,...string[]]),content_base64:z.string().min(1)}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:'Provide a title and a supported file (PDF, Word, PowerPoint, image or text).'});
  const buf=Buffer.from(s.data.content_base64,'base64');
  if(!buf.length||buf.length>env.MAX_UPLOAD_BYTES)return res.status(413).json({message:`File must be between 1 byte and ${Math.floor(env.MAX_UPLOAD_BYTES/1048576)} MB.`});
  const db=scopedDb(req);
  const {data:course}=await db.from('courses').select('id,teacher_id').eq('id',s.data.course_id).maybeSingle();
  if(!course||(req.profile!.role!=='admin'&&course.teacher_id!==req.profile!.id))return res.status(403).json({message:'You cannot add materials to this course.'});
  const safe=s.data.file_name.replace(/[^A-Za-z0-9._-]/g,'_');const file_path=`${s.data.course_id}/${randomUUID()}-${safe}`;
  const up=await adminDb.storage.from('course-resources').upload(file_path,buf,{contentType:s.data.mime_type});
  if(up.error)return fail(res,up.error);
  const {data,error}=await db.from('resources').insert({course_id:s.data.course_id,title:s.data.title,description:s.data.description,file_path,file_name:s.data.file_name,file_size:buf.length,mime_type:s.data.mime_type,created_by:req.profile!.id}).select().single();
  if(error){await adminDb.storage.from('course-resources').remove([file_path]);return fail(res,error)}
  res.status(201).json(data);
}));
gutechRouter.delete('/materials/:id',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const db=scopedDb(req);
  const {data:r}=await db.from('resources').select('id,file_path').eq('id',req.params.id).maybeSingle();
  if(!r)return res.status(404).json({message:'Material not found.'});
  const {error}=await db.from('resources').delete().eq('id',req.params.id);if(error)return fail(res,error);
  await adminDb.storage.from('course-resources').remove([r.file_path]);res.status(204).end();
}));

// ---------------- student management (admin) ----------------
const studentFields={full_name:z.string().trim().min(2).max(120),email:z.string().email(),program:z.string().max(120).nullable().optional(),department:z.string().max(120).nullable().optional(),semester:z.number().int().min(1).max(12).nullable().optional()};
gutechRouter.post('/admin/students',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const s=z.object({roll_number:rollSchema,password:z.string().min(12).max(200),...studentFields}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:'Provide roll number, name, email and a temporary password of at least 12 characters.'});
  const {data:dup}=await adminDb.from('profiles').select('id').ilike('roll_number',s.data.roll_number).maybeSingle();
  if(dup)return res.status(409).json({message:'That roll number is already registered.'});
  const {data,error}=await adminDb.auth.admin.createUser({email:s.data.email,password:s.data.password,email_confirm:true,user_metadata:{full_name:s.data.full_name}});
  if(error||!data.user)return res.status(409).json({message:error?.message||'Could not create the account.'});
  const {data:profile,error:pe}=await adminDb.from('profiles').update({full_name:s.data.full_name,role:'student',roll_number:s.data.roll_number,program:s.data.program,department:s.data.department,semester:s.data.semester}).eq('id',data.user.id).select('id,full_name,email,roll_number,program,department,semester').single();
  if(pe){await adminDb.auth.admin.deleteUser(data.user.id);return fail(res,pe)}
  res.status(201).json(profile);
}));
gutechRouter.get('/admin/students',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const {data,error}=await scopedDb(req).from('profiles').select('id,full_name,email,roll_number,program,department,semester').eq('role','student').order('roll_number').limit(1000);
  if(error)return fail(res,error);res.json(data);
}));
gutechRouter.patch('/admin/students/:id',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const s=z.object(studentFields).partial().safeParse(req.body);if(!s.success)return res.status(400).json({message:'Check the student details.'});
  const {data,error}=await scopedDb(req).from('profiles').update(s.data).eq('id',req.params.id).eq('role','student').select('id,full_name,email,roll_number,program,department,semester').single();
  if(error)return fail(res,error);res.json(data);
}));
gutechRouter.delete('/admin/students/:id',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const {data:p}=await adminDb.from('profiles').select('id,role').eq('id',req.params.id).maybeSingle();
  if(!p||p.role!=='student')return res.status(404).json({message:'Student not found.'});
  const {error}=await adminDb.auth.admin.deleteUser(p.id);if(error)return fail(res,error);res.status(204).end();
}));

/** Demo-only: reset the local demo database to the seeded state. Admin only; has no effect outside DEMO_MODE. */
gutechRouter.post('/demo/reset',authenticate,allowRoles('admin'),route(async(_req,res)=>{
  if(!DEMO)return res.status(404).json({message:'Not available.'});
  res.json({reset:true,counts:getStore().reset()});
}));
