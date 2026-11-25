import { createClient } from '@supabase/supabase-js';
import { env } from './config.js';
export const adminDb=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
export const authDb=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
