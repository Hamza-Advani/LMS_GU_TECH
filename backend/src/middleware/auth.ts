import type { NextFunction,Response } from 'express';
import { authDb,adminDb } from '../supabase.js';
import type { AuthedRequest,Role } from '../types.js';
export async function authenticate(req:AuthedRequest,res:Response,next:NextFunction){
 const token=req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token){res.status(401).json({message:'Sign in to continue.'});return}
 const {data,error}=await authDb.auth.getUser(token);
 if(error||!data.user){res.status(401).json({message:'Your session is invalid or expired.'});return}
 const {data:profile,error:profileError}=await adminDb.from('profiles').select('id,full_name,email,role,department,avatar_url,roll_number,program,semester').eq('id',data.user.id).single();
 if(profileError||!profile){res.status(403).json({message:'Your account profile is not set up. Contact an administrator.'});return}
 req.user={id:data.user.id,email:data.user.email};req.profile=profile;next();
}
export function allowRoles(...roles:Role[]){return(req:AuthedRequest,res:Response,next:NextFunction)=>{if(!req.profile||!roles.includes(req.profile.role)){res.status(403).json({message:'You do not have access to this action.'});return}next()}}
