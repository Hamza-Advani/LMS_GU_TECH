import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type Meta = { demo: boolean; timezone: string; demoAccounts?: { student: { roll: string; password: string }; admin: { email: string; password: string } } };
/** Public server info: whether the backend runs on the local DEMO database, so the UI can label it honestly. */
export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta', {}, { auth: false }), staleTime: Infinity, retry: 1 });
