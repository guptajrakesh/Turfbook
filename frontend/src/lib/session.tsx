import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, applySession, refreshSession, setSessionListener, type Session } from "./api";

type Ctx = {
  session: Session | null;
  ready: boolean;
  setSession: (s: Session | null) => void;
  logout: () => Promise<void>;
  switchTenant: (id: string) => Promise<void>;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionListener(setState);
    refreshSession().finally(() => setReady(true));
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    applySession(null);
  }, []);

  const switchTenant = useCallback(async (id: string) => {
    await refreshSession(id);
  }, []);

  const value = useMemo(
    () => ({ session, ready, setSession: applySession, logout, switchTenant }),
    [session, ready, logout, switchTenant],
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/* ---- player location ------------------------------------------------------ */

export type Place = { lat?: number; lng?: number; area?: string | null; city?: string | null; source: "gps" | "manual" | "saved" };

const KEY = "turftime.place";

function readSaved(): Place | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...(JSON.parse(raw) as Place), source: "saved" } : null;
  } catch {
    return null;
  }
}

function save(p: Place) {
  // Precise coordinates are never persisted; only the chosen area/city.
  try {
    localStorage.setItem(KEY, JSON.stringify({ area: p.area ?? null, city: p.city ?? null }));
  } catch {
    /* storage unavailable */
  }
}

type PlaceCtx = {
  place: Place | null;
  locating: boolean;
  error: string | null;
  detect: () => void;
  choose: (city: string) => void;
};

const PlaceContext = createContext<PlaceCtx | null>(null);

export function PlaceProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<Place | null>(() => readSaved());
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detect = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Location isn't available on this device. Pick your city instead.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        let label: { area: string | null; city: string | null } = { area: null, city: null };
        try {
          label = await api(`/geo/nearest-area?lat=${lat}&lng=${lng}`);
        } catch {
          /* label is optional */
        }
        const p: Place = { lat, lng, ...label, source: "gps" };
        setPlace(p);
        save(p);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("We couldn't get your location. Pick your city instead.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  const choose = useCallback((city: string) => {
    const p: Place = { city, area: null, source: "manual" };
    setPlace(p);
    save(p);
    api("/auth/me", { method: "PATCH", json: { city } }).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ place, locating, error, detect, choose }), [place, locating, error, detect, choose]);
  return <PlaceContext.Provider value={value}>{children}</PlaceContext.Provider>;
}

export function usePlace() {
  const ctx = useContext(PlaceContext);
  if (!ctx) throw new Error("usePlace outside PlaceProvider");
  return ctx;
}
