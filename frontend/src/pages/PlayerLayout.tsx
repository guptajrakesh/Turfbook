import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "../components/sport";
import { useSession } from "../lib/session";
import { useEffect } from "react";

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const NAV = [
  { to: "/", label: "Explore", icon: "M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
  { to: "/games", label: "My games", icon: "M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM10 7v12" },
  { to: "/owner", label: "For venues", icon: "M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" },
];

export default function PlayerLayout() {
  const { session, logout } = useSession();
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-pitch-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label="TurfTime home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive ? "text-lime" : "text-chalk-dim hover:text-chalk"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
            {session ? (
              <button onClick={logout} className="ml-2 rounded-lg px-3 py-2 text-sm text-chalk-mute hover:text-chalk">
                Log out
              </button>
            ) : (
              <Link to="/login" className="btn-lime ml-2 py-2">
                Log in
              </Link>
            )}
          </nav>
          {!session && (
            <Link to="/login" className="btn-lime py-1.5 sm:hidden">
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <Outlet />
      </main>

      <footer className="mx-auto mt-16 hidden max-w-6xl border-t border-white/5 px-4 py-8 text-xs text-chalk-mute sm:block">
        TurfTime · Book turf, box cricket, badminton, pickleball and tennis courts near you.
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-white/10 bg-pitch-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? "text-lime" : "text-chalk-mute"}`}
          >
            <NavIcon d={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
