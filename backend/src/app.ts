import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {env} from './config.js';
import {apiRouter} from './routes/index.js';
import {errorHandler,notFound} from './middleware/errors.js';
import {DEMO,demoAuthRouter,demoMiscRouter} from './demo/index.js';
const app=express();
app.disable('x-powered-by');if(process.env.TRUST_PROXY)app.set('trust proxy',Number(process.env.TRUST_PROXY)||process.env.TRUST_PROXY); // set TRUST_PROXY=1 behind a single reverse proxy (e.g. Vercel) so rate limiting sees client IPs
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));app.use(cors({origin:env.FRONTEND_ORIGIN,credentials:true}));app.use(express.json({limit:'14mb'}));
app.use('/api',rateLimit({windowMs:60_000,limit:DEMO?5000:300,standardHeaders:'draft-7',legacyHeaders:false}));
app.get('/health',(_req,res)=>res.json({status:'ok',service:'gutech-lms-api',demo:DEMO}));
if(DEMO){app.use('/auth/v1',demoAuthRouter());app.use(demoMiscRouter());console.warn('*** DEMO_MODE: using local demo data. This is NOT connected to Supabase. ***')}
app.use('/api',apiRouter);app.use(notFound);app.use(errorHandler);
export default app;
