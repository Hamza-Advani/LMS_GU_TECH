import 'dotenv/config';
import { z } from 'zod';
const demo = process.env.DEMO_MODE === 'true';
const supa = (v: z.ZodString) => (demo ? v.default('demo-mode-unused') : v);
const schema=z.object({PORT:z.coerce.number().default(4000),NODE_ENV:z.enum(['development','test','production']).default('development'),FRONTEND_ORIGIN:z.string().url().default('http://localhost:5173'),SUPABASE_URL:demo?z.string().default('http://demo.invalid'):z.string().url(),SUPABASE_ANON_KEY:supa(z.string().min(1)),SUPABASE_SERVICE_ROLE_KEY:supa(z.string().min(1)),MAX_UPLOAD_BYTES:z.coerce.number().int().positive().default(10_485_760)});
const parsed=schema.safeParse(process.env);
if(!parsed.success){console.error('Invalid environment configuration:',parsed.error.flatten().fieldErrors);process.exit(1)}
export const env=parsed.data;
export const DEMO_MODE=demo;
