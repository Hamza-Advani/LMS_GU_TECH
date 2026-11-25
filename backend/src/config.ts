import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({PORT:z.coerce.number().default(4000),NODE_ENV:z.enum(['development','test','production']).default('development'),FRONTEND_ORIGIN:z.string().url().default('http://localhost:5173'),SUPABASE_URL:z.string().url(),SUPABASE_ANON_KEY:z.string().min(1),SUPABASE_SERVICE_ROLE_KEY:z.string().min(1),MAX_UPLOAD_BYTES:z.coerce.number().int().positive().default(10_485_760)});
const parsed=schema.safeParse(process.env);
if(!parsed.success){console.error('Invalid environment configuration:',parsed.error.flatten().fieldErrors);process.exit(1)}
export const env=parsed.data;
