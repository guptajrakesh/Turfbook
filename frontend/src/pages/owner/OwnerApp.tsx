import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import LoginForm from "../../components/LoginForm";
import { Logo, PitchLines } from "../../components/sport";
import { Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import type { Court, Venue } from "../../lib/types";
import Admin from "./Admin";
import Calendar from "./Calendar";
import CheckInDesk from "./CheckInDesk";
import Matchday from "./Matchday";
import Onboarding from "./Onboarding";
import Reports from "./Reports";
import Setup from "./Setup";
import Staff from "./Staff";

export type OwnerLocation = Venue & { courts: Court[] };
type Ctx = { locations: OwnerLocation[]; locationId: string; setLocationId: (id: string) => void; role: string; refetch: () => void };
const OwnerCtx = createContext<Ctx | null>(null);
export const useOwner = () => useContext(OwnerCtx)!;

const LINKS = [
  { to: "", label: "Matchday", min: "staff", d: "M3 12h4l3-8 4 16 3-8h4" },
  { to: "calendar", label: "Calendar", min: "staff", d: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" },
  { to: "check-in", label: "Check-in", min: "staff", d: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2v2M14 18h2v2h4" },
  { to: "setup", label: "Venue setup", min: "manager", d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.3-1.3.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L6 7.3 4 7 3 10l2 1v2l-2 1 1 3 2-.3 1.3 1.3-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.3-1.3 2 .3 1-3-2-1z" },
  { to: "reports", label: "Reports", min: "owner", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { to: "staff", label: "Staff", min: "owner", d: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6" },
];
const RANK: Record<string, number> = { staff: 1, manager: 2, owner: 3 };

export default function OwnerApp() {
  const { session, ready, logout, switchTenant } = useSession();
  const tenant = session?.tenant;
  const locations = useQuery({
    queryKey: ["owner-locations", tenant?.id],
    queryFn: () => api<OwnerLocation[]>("/owner/locations"),
    enabled: !!tenant,
  });
  const [locationId, setLocationIdState] = useState<string>(() => {
    try {
      return localStorage.getItem("turftime.owner.location") ?? "";
    } catch {
      return "";
    }
  });
  const setLocationId = (id: string) => {
    setLocationIdState(id);
    try {
      localStorage.setItem("turftime.owner.location", id);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    const list = locations.data;
    if (list?.length && !list.some((l) => l.id === locationId)) setLocationIdState(list[0].id);
  }, [locations.data, locationId]);

  if (!ready) return <Spinner />;
  if (!session) return <OwnerLogin />;
  if (session.user.is_platform_admin && !tenant) return <Shell><Admin /></Shell>;
  if (!tenant) return <Shell><Onboarding /></Shell>;
  if (locations.isLoading) return <Spinner label="Opening the dugout" />;

  const role = tenant.role;
  const ctx: Ctx = { locations: locations.data ?? [], locationId, setLocationId, role, refetch: () => locations.refetch() };

  return (
    <OwnerCtx.Provider value={ctx}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="turf-night sticky top-0 z-30 border-b border-white/10 lg:h-dvh lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between p-4 lg:block">
            <Link to="/owner"><Logo /></Link>
            <p className="eyebrow mt-0 lg:mt-1">Venue dugout</p>
          </div>
          <div className="px-4 pb-3">
            {session.tenants.length > 1 ? (
              <select className="input py-2 text-sm" value={tenant.id} onChange={(e) => switchTenant(e.target.value)} aria-label="Business">
                {session.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <p className="truncate font-semibold">{tenant.name}</p>
            )}
            <p className="text-xs capitalize text-chalk-mute">{role} · {session.user.name ?? session.user.phone}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
            {LINKS.filter((l) => RANK[role] >= RANK[l.min]).map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? "bg-lime text-pitch-950" : "text-chalk-dim hover:bg-white/5 hover:text-chalk"
                  }`
                }
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={l.d} /></svg>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden px-4 pt-6 text-sm lg:block">
            <Link to="/" className="block py-1 text-chalk-mute hover:text-chalk">Player app ↗</Link>
            <button onClick={logout} className="py-1 text-chalk-mute hover:text-flag">Log out</button>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6 lg:px-8">
          {tenant.kyc_status === "pending" && role === "owner" && (
            <p className="mb-4 rounded-xl border border-amber/40 bg-amber/10 px-4 py-2.5 text-sm text-amber">
              Payout KYC is pending with the payment gateway. You can take walk-in and cash bookings meanwhile.
            </p>
          )}
          {ctx.locations.length === 0 && role === "owner" ? (
            <Setup firstRun />
          ) : (
            <Routes>
              <Route index element={<Matchday />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="check-in" element={<CheckInDesk />} />
              <Route path="setup" element={<Setup />} />
              <Route path="reports" element={<Reports />} />
              <Route path="staff" element={<Staff />} />
              <Route path="admin" element={<Admin />} />
            </Routes>
          )}
        </main>
      </div>
    </OwnerCtx.Provider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { logout } = useSession();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <Link to="/owner"><Logo /></Link>
        <button onClick={logout} className="text-sm text-chalk-mute hover:text-chalk">Log out</button>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}

function OwnerLogin() {
  return (
    <div className="turf-night relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <PitchLines className="absolute inset-0 h-full w-full text-white/[0.06]" />
      <div className="relative grid w-full max-w-4xl gap-8 md:grid-cols-2 md:items-center">
        <div>
          <Logo />
          <h1 className="display mt-6 text-6xl sm:text-7xl">
            Run your venue
            <br />
            <span className="text-lime">like a pro club.</span>
          </h1>
          <ul className="mt-6 space-y-2 text-chalk-dim">
            <li>· Every booking channel on one calendar, zero double bookings</li>
            <li>· Online payments straight to your account</li>
            <li>· Peak pricing, walk-ins, QR check-in and daily reports</li>
          </ul>
          <p className="mt-6 text-xs text-chalk-mute">Demo: owner 9999900001 · front desk 9999900003 · admin 9999900000</p>
        </div>
        <div className="card p-6">
          <h2 className="display text-4xl">Staff login</h2>
          <p className="mb-5 text-sm text-chalk-dim">New venue? Log in with your number and we'll set you up in minutes.</p>
          <LoginForm cta="Enter the dugout" />
        </div>
      </div>
    </div>
  );
}

export function LocationPicker() {
  const { locations, locationId, setLocationId } = useOwner();
  if (locations.length <= 1) return <p className="font-semibold">{locations[0]?.name}</p>;
  return (
    <select className="input w-auto py-2 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Location">
      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  );
}
