import type {ErrorRequestHandler,RequestHandler} from 'express';
export const notFound:RequestHandler=(_req,res)=>{res.status(404).json({message:'The requested resource was not found.'})};
export const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{console.error(error);if(res.headersSent)return;const status=Number(error?.status)||500;res.status(status).json({message:status>=500?'An unexpected server error occurred.':error.message||'Request failed.'})};
