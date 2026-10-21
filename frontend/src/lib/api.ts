const BASE = (import.meta.env.VITE_API_URL ?? "") + "/api/v1";

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSession: ((s: Session | null) => void) | null = null;

export type Tenant = { id: string; name: string; role: "owner" | "manager" | "staff"; kyc_status?: string };
export type User = { id: string; phone: string; name: string | null; email: string | null; city: string | null; is_platform_admin: boolean };
export type Session = { access_token: string; user: User; tenant: Tenant | null; tenants: Tenant[] };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function setSessionListener(fn: (s: Session | null) => void) {
  onSession = fn;
}

export function applySession(s: Session | null) {
  accessToken = s?.access_token ?? null;
  onSession?.(s);
}

export async function refreshSession(tenantId?: string): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh${tenantId ? `?tenant_id=${tenantId}` : ""}`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          applySession(null);
          return false;
        }
        applySession(await r.json());
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (res.status === 401 && retry && (await refreshSession())) {
    return api<T>(path, init, false);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : body.detail?.[0]?.msg ?? msg;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : "";
};
