import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {env} from '../config.js';
import {DEMO,demoScopedClient} from '../demo/index.js';
import type {AuthedRequest} from '../types.js';
export function scopedDb(req:AuthedRequest):SupabaseClient{const token=req.headers.authorization?.slice(7)||'';if(DEMO)return demoScopedClient(token) as unknown as SupabaseClient;return createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})}

