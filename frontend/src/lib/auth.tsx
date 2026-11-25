import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { api } from './api';

export type Role = 'admin' | 'teacher' | 'student';
export type Profile = { id: string; full_name: string; email: string; role: Role; department?: string | null; avatar_url?: string | null; roll_number?: string | null; program?: string | null; semester?: number | null };
type AuthValue = { session: Session | null; profile: Profile | null; loading: boolean; profileError: string; signIn: (id: string, pw: string) => Promise<void>; signOut: () => Promise<void> };
const Ctx = createContext<AuthValue>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) { setSession(data.session); if (!data.session) setLoading(false); } })
      .catch(() => alive && setLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setProfile(null); setLoading(false); } });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const token = session?.access_token;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true); setProfileError('');
    api<Profile>('/users/me').then(p => alive && setProfile(p)).catch(e => alive && setProfileError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const t = await api<{ access_token: string; refresh_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }, { auth: false });
    const { error } = await supabase.auth.setSession(t);
    if (error) throw new Error('Could not start your session. Please try again.');
  }, []);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); setProfile(null); }, []);

  const value = useMemo(() => ({ session, profile, loading, profileError, signIn, signOut }), [session, profile, loading, profileError, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
