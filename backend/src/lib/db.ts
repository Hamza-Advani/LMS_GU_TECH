import {createClient} from '@supabase/supabase-js';
import {env} from '../config.js';
import type {AuthedRequest} from '../types.js';
export function scopedDb(req:AuthedRequest){const token=req.headers.authorization?.slice(7)||'';return createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})}
