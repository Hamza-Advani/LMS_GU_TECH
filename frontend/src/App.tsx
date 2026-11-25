import { useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, BookOpen, CalendarDays, ClipboardList, GraduationCap, LayoutDashboard, LogOut, Menu, Percent, Settings2, X } from 'lucide-react';
import { AuthProvider, useAuth, type Role } from './lib/auth';
import { api } from './lib/api';
import { BRAND } from './lib/brand';
import { ErrorState, Logo, Spinner } from './components/ui';
import { ForgotPassword, Login, ResetPassword } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CourseDetail, Courses } from './pages/Courses';
import { Timetable } from './pages/Timetable';
import { Attendance } from './pages/Attendance';
import { Results } from './pages/Results';
import { Assignments } from './pages/Assignments';
import { Notices, type Notifications } from './pages/Notices';
import { Admin } from './pages/admin/Admin';

function Splash({ text = 'Loading your portal' }: { text?: string }) {
  return <div className="splash" role="status"><Logo size={72} /><Spinner label={text} /><span>{text}…</span></div>;
}

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { session, profile, loading, profileError, signOut } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!profile) return <div className="splash"><ErrorState message={profileError || 'Your account profile is not set up. Contact the administrator.'} onRetry={() => location.reload()} /><button className="btn" onClick={signOut}>Sign out</button></div>;
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

type NavItem = { to: string; label: string; icon: ReactNode; roles?: Role[] };
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/courses', label: 'Courses', icon: <BookOpen size={18} /> },
  { to: '/timetable', label: 'Timetable', icon: <CalendarDays size={18} /> },
  { to: '/attendance', label: 'Attendance', icon: <Percent size={18} />, roles: ['student'] },
  { to: '/results', label: 'Results', icon: <GraduationCap size={18} />, roles: ['student'] },
  { to: '/assignments', label: 'Assignments', icon: <ClipboardList size={18} /> },
  { to: '/notifications', label: 'Notifications', icon: <Bell size={18} /> },
  { to: '/manage', label: 'Manage', icon: <Settings2 size={18} />, roles: ['admin', 'teacher'] },
];

function Shell() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const notes = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notifications>('/notifications'), retry: 0 });
  const unread = notes.data?.announcements.filter(a => !a.read).length ?? 0;
  const items = NAV.filter(n => !n.roles || (profile && n.roles.includes(profile.role)));
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="side-brand"><Logo size={44} /><div><b>{BRAND.short}</b><small>{BRAND.school}</small></div><button className="icon-btn close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <nav aria-label="Main">{items.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
            {n.icon}<span>{n.label}</span>{n.to === '/notifications' && unread > 0 && <i className="badge">{unread}</i>}
          </NavLink>))}
        </nav>
        <div className="side-foot"><div className="who"><b>{profile?.full_name}</b><small>{profile?.roll_number || profile?.role}</small></div><button className="btn sm full" onClick={signOut}><LogOut size={15} /> Log out</button></div>
      </aside>
      {open && <button className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar"><button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button><div className="top-brand"><Logo size={30} /><b>{BRAND.short}</b></div>
          <NavLink to="/notifications" className="icon-btn bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}><Bell size={20} />{unread > 0 && <i className="badge">{unread}</i>}</NavLink></header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/attendance" element={<Protected roles={['student']}><Attendance /></Protected>} />
            <Route path="/results" element={<Protected roles={['student']}><Results /></Protected>} />
            <Route path="/assignments" element={<Assignments />} />
            <Route path="/notifications" element={<Notices />} />
            <Route path="/manage" element={<Protected roles={['admin', 'teacher']}><Admin /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/*" element={<Protected><Shell /></Protected>} />
      </Routes>
    </AuthProvider>
  );
}
