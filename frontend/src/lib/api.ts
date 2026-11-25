import { supabase } from './supabase';
export const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const TIMEOUT_MS = 15000;

export async function api<T>(path: string, init: RequestInit = {}, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (opts.auth !== false) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, { ...init, headers, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Something went wrong. Please try again.');
    }
    return res.status === 204 ? (undefined as T) : res.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.', { cause: e });
    if (e instanceof TypeError) throw new Error('Cannot reach the server. Check your connection and try again.', { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
