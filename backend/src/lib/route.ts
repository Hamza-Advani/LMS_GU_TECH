import type {AsyncRoute} from '../types.js';
export const route=(handler:AsyncRoute)=>(req:Parameters<AsyncRoute>[0],res:Parameters<AsyncRoute>[1],next:Parameters<AsyncRoute>[2])=>{Promise.resolve(handler(req,res,next)).catch(next)};
