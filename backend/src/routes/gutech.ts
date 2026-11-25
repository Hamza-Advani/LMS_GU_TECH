import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {authenticate,allowRoles} from '../middleware/auth.js';
import {route} from '../lib/route.js';
import {scopedDb} from '../lib/db.js';
import {adminDb,authDb} from '../supabase.js';
import {env} from '../config.js';

export const gutechRouter=Router();

const idSchema=z.string().uuid();
const rollSchema=z.string().trim().regex(/^[A-Za-z0-9\-/]{3,30}$/);
const GENERIC_LOGIN_ERROR='Invalid roll number or password.';
const authLimiter=rateLimit({windowMs:15*60_000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,message:{message:'Too many attempts. Please try again later.'}});

/** Resolve a login identifier (roll number, or email for staff) to an auth email. Never reveals whether it exists. */
async function resolveEmail(identifier:string):Promise<string|null>{
  if(identifier.includes('@')){return z.string().email().safeParse(identifier).success?identifier.toLowerCase():null}
  const roll=rollSchema.safeParse(identifier);
  if(!roll.success)return null;
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
  // Same response whether or not the account exists (prevents roll-number enumeration).
  res.json({message:'If that account exists, a reset link has been sent to its registered email.'});
}));

const TZ=process.env.INSTITUTE_TZ||'Asia/Karachi';
function nowInTz(){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=(t:string)=>parts.find(p=>p.type===t)!.value;
  const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
  return {day,minutes:Number(get('hour'))*60+Number(get('minute'))};
}
const toMin=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m};

type Slot={id:string;course_id:string;day_of_week:number;start_time:string;end_time:string;room:string|null;courses?:{code:string;title:string}|{code:string;title:string}[]|null};
const slotCourse=(s:Slot)=>Array.isArray(s.courses)?s.courses[0]:s.courses;

function summarize(rows:{course_id:string;status:string}[]){
  const by=new Map<string,{total:number;attended:number}>();
  for(const r of rows){const e=by.get(r.course_id)??{total:0,attended:0};e.total++;if(r.status==='present'||r.status==='late')e.attended++;by.set(r.course_id,e)}
  const total=rows.length,attended=[...by.values()].reduce((n,e)=>n+e.attended,0);
  return {total,attended,percentage:total?Math.round(attended/total*1000)/10:null,byCourse:by};
}

gutechRouter.get('/dashboard',authenticate,route(async(req,res)=>{
  const db=scopedDb(req),me=req.profile!;
  const [{data:courses,error:ce},{data:slots,error:se},{data:att,error:ae}]=await Promise.all([
    db.from('courses').select('id,code,title,credit_hours').order('code'),
    db.from('timetable_slots').select('id,course_id,day_of_week,start_time,end_time,room,courses(code,title)'),
    db.from('attendance').select('course_id,status').eq('student_id',me.id)
  ]);
  const err=ce||se||ae;if(err)return res.status(400).json({message:err.message});
  const now=nowInTz();
  const all=((slots||[]) as Slot[]).sort((a,b)=>a.day_of_week-b.day_of_week||a.start_time.localeCompare(b.start_time));
  const today=all.filter(s=>s.day_of_week===now.day);
  let next:(Slot&{daysAhead:number})|null=null;
  for(let ahead=0;ahead<=7&&!next;ahead++){
    const day=(now.day+ahead)%7;
    const cand=all.filter(s=>s.day_of_week===day&&(ahead>0||toMin(s.start_time)>now.minutes));
    if(cand.length)next={...cand[0],daysAhead:ahead};
  }
  const a=summarize(att||[]);
  res.json({
    profile:me,
    totals:{courses:courses?.length||0,creditHours:(courses||[]).reduce((n,c)=>n+Number(c.credit_hours||0),0)},
    classesToday:today.map(s=>({id:s.id,code:slotCourse(s)?.code,title:slotCourse(s)?.title,start:s.start_time,end:s.end_time,room:s.room})),
    nextClass:next&&{id:next.id,code:slotCourse(next)?.code,title:slotCourse(next)?.title,day:next.day_of_week,start:next.start_time,end:next.end_time,room:next.room,daysAhead:next.daysAhead},
    attendance:{percentage:a.percentage,attended:a.attended,total:a.total}
  });
}));

gutechRouter.get('/timetable',authenticate,route(async(req,res)=>{
  const {data,error}=await scopedDb(req).from('timetable_slots').select('id,course_id,day_of_week,start_time,end_time,room,courses(code,title)').order('day_of_week').order('start_time');
  if(error)return res.status(400).json({message:error.message});res.json(data);
}));
gutechRouter.post('/timetable',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const s=z.object({course_id:idSchema,day_of_week:z.number().int().min(0).max(6),start_time:z.string().regex(/^\d{2}:\d{2}$/),end_time:z.string().regex(/^\d{2}:\d{2}$/),room:z.string().max(60).optional()}).refine(x=>x.end_time>x.start_time,{message:'End time must be after start time.'}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:'Check the timetable fields.'});
  const {data,error}=await scopedDb(req).from('timetable_slots').insert({...s.data,created_by:req.profile!.id}).select().single();
  if(error)return res.status(400).json({message:error.message});res.status(201).json(data);
}));
gutechRouter.delete('/timetable/:id',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const {error}=await scopedDb(req).from('timetable_slots').delete().eq('id',req.params.id);
  if(error)return res.status(400).json({message:error.message});res.status(204).end();
}));

gutechRouter.get('/attendance',authenticate,route(async(req,res)=>{
  const db=scopedDb(req);
  const [{data:rows,error},{data:courses}]=await Promise.all([
    db.from('attendance').select('id,course_id,attended_on,status').eq('student_id',req.profile!.id).order('attended_on',{ascending:false}).limit(1000),
    db.from('courses').select('id,code,title')
  ]);
  if(error)return res.status(400).json({message:error.message});
  const a=summarize(rows||[]);
  res.json({
    overall:{percentage:a.percentage,attended:a.attended,total:a.total},
    courses:(courses||[]).map(c=>{const e=a.byCourse.get(c.id)??{total:0,attended:0};return {...c,total:e.total,attended:e.attended,percentage:e.total?Math.round(e.attended/e.total*1000)/10:null}}),
    history:(rows||[]).slice(0,200)
  });
}));
gutechRouter.post('/attendance',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const s=z.object({course_id:idSchema,attended_on:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),records:z.array(z.object({student_id:idSchema,status:z.enum(['present','absent','late','leave'])})).min(1).max(500)}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:'Check the attendance details.'});
  const rows=s.data.records.map(r=>({course_id:s.data.course_id,attended_on:s.data.attended_on,student_id:r.student_id,status:r.status,marked_by:req.profile!.id}));
  const {data,error}=await scopedDb(req).from('attendance').upsert(rows,{onConflict:'course_id,student_id,attended_on'}).select('id');
  if(error)return res.status(400).json({message:error.message});res.status(201).json({saved:data?.length||0});
}));

gutechRouter.get('/results',authenticate,route(async(req,res)=>{
  const {data,error}=await scopedDb(req).from('marks').select('id,score,max_score,feedback,assessment,created_at,courses(id,code,title),assignments(title)').eq('student_id',req.profile!.id).order('created_at',{ascending:false}).limit(500);
  if(error)return res.status(400).json({message:error.message});res.json(data);
}));

gutechRouter.post('/admin/students',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const s=z.object({roll_number:rollSchema,full_name:z.string().min(2).max(120),email:z.string().email(),password:z.string().min(12).max(200),program:z.string().max(120).optional(),department:z.string().max(120).optional(),semester:z.number().int().min(1).max(12).optional()}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:'Provide roll number, name, email and a temporary password of at least 12 characters.'});
  const {data:dup}=await adminDb.from('profiles').select('id').ilike('roll_number',s.data.roll_number).maybeSingle();
  if(dup)return res.status(409).json({message:'That roll number is already registered.'});
  const {data,error}=await adminDb.auth.admin.createUser({email:s.data.email,password:s.data.password,email_confirm:true,user_metadata:{full_name:s.data.full_name}});
  if(error)return res.status(400).json({message:error.message});
  const {data:profile,error:pe}=await adminDb.from('profiles').update({full_name:s.data.full_name,role:'student',roll_number:s.data.roll_number,program:s.data.program,department:s.data.department,semester:s.data.semester}).eq('id',data.user.id).select('id,full_name,email,roll_number,program,department,semester').single();
  if(pe)return res.status(400).json({message:pe.message});res.status(201).json(profile);
}));
gutechRouter.get('/admin/students',authenticate,allowRoles('admin'),route(async(req,res)=>{
  const {data,error}=await scopedDb(req).from('profiles').select('id,full_name,email,roll_number,program,department,semester').eq('role','student').order('roll_number').limit(1000);
  if(error)return res.status(400).json({message:error.message});res.json(data);
}));

gutechRouter.get('/notifications',authenticate,route(async(req,res)=>{
  const db=scopedDb(req),me=req.profile!;
  const [{data:anns,error:e1},{data:reads},{data:assigns,error:e2},{data:subs}]=await Promise.all([
    db.from('announcements').select('id,title,body,course_id,is_global,created_at').order('created_at',{ascending:false}).limit(50),
    db.from('announcement_reads').select('announcement_id').eq('user_id',me.id),
    db.from('assignments').select('id,title,due_at,courses(code)').gte('due_at',new Date().toISOString()).lte('due_at',new Date(Date.now()+7*864e5).toISOString()).order('due_at'),
    db.from('submissions').select('assignment_id').eq('student_id',me.id)
  ]);
  const err=e1||e2;if(err)return res.status(400).json({message:err.message});
  const readSet=new Set((reads||[]).map(r=>r.announcement_id)),done=new Set((subs||[]).map(s=>s.assignment_id));
  res.json({
    announcements:(anns||[]).map(a=>({...a,read:readSet.has(a.id)})),
    deadlines:me.role==='student'?(assigns||[]).filter(a=>!done.has(a.id)):[]
  });
}));

gutechRouter.post('/results',authenticate,allowRoles('admin','teacher'),route(async(req,res)=>{
  const s=z.object({student_id:idSchema,course_id:idSchema,assessment:z.string().trim().min(2).max(120),score:z.number().min(0),max_score:z.number().positive(),feedback:z.string().max(5000).optional()}).refine(x=>x.score<=x.max_score,{message:'Score cannot exceed the maximum.'}).safeParse(req.body);
  if(!s.success)return res.status(400).json({message:'Enter valid result details (score cannot exceed maximum).'});
  const {data,error}=await scopedDb(req).from('marks').insert({...s.data,entered_by:req.profile!.id}).select().single();
  if(error)return res.status(400).json({message:error.message});res.status(201).json(data);
}));

gutechRouter.get('/resources/:id/download',authenticate,route(async(req,res)=>{
  const db=scopedDb(req);
  const {data:r,error}=await db.from('resources').select('file_path,file_name').eq('id',req.params.id).maybeSingle();
  if(error)return res.status(400).json({message:error.message});
  if(!r)return res.status(404).json({message:'Material not found.'});
  const {data,error:se}=await db.storage.from('course-resources').createSignedUrl(r.file_path,60,{download:r.file_name});
  if(se||!data)return res.status(403).json({message:'You do not have access to this file.'});
  res.json({url:data.signedUrl});
}));
