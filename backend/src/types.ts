import type { Request } from 'express';
export type Role='admin'|'teacher'|'student';
export type AuthUser={id:string;email?:string};
export type Profile={id:string;full_name:string;email:string;role:Role;department?:string|null;avatar_url?:string|null;roll_number?:string|null;program?:string|null;semester?:number|null};
export type AuthedRequest=Request & {user?:AuthUser;profile?:Profile};
export type AsyncRoute=(req:AuthedRequest,res:import('express').Response,next:import('express').NextFunction)=>Promise<unknown>;
