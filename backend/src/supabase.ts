import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './config.js';
import { DEMO, demoAdminClient, demoAuthClient } from './demo/index.js';
// In DEMO_MODE these are in-process stand-ins backed by a local JSON file (see src/demo). Otherwise real Supabase clients.
export const adminDb:SupabaseClient=DEMO?(demoAdminClient() as unknown as SupabaseClient):createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
export const authDb:SupabaseClient=DEMO?(demoAuthClient() as unknown as SupabaseClient):createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

