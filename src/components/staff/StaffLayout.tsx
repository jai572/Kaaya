import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "../../styles/staff.css";

const DAILY_LINKS = [
  { to: "/staff/calendar", label: "Calendar" },
  { to: "/staff/bookings", label: "Approvals & requests" },
  { to: "/staff", label: "Consultations", end: true },
];

const SETUP_LINKS = [
  { to: "/staff/services", label: "Services" },
  { to: "/staff/staff-members", label: "Staff" },
  { to: "/staff/rota", label: "Rota" },
  { to: "/staff/locations", label: "Locations" },
  { to: "/staff/permissions", label: "Permissions" },
];

export default function StaffLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/staff/login", { replace: true });
        return;
      }
      setEmail(data.session.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/staff/login", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/staff/login", { replace: true });
  }

  if (!ready) return null;

  return (
    <div className="st-app">
      <aside className="st-side">
        <Link to="/staff/calendar" className="st-brand">
          Kaaya
          <small>Staff</small>
        </Link>
        <nav className="st-nav" aria-label="Staff">
          <span className="st-nav-label">Day to day</span>
          {DAILY_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
          <span className="st-nav-label">Setup</span>
          {SETUP_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="st-side-foot">
          {email && <span title={email}>{email}</span>}
          <button type="button" className="st-link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="st-main">
        <Outlet />
      </main>
    </div>
  );
}
