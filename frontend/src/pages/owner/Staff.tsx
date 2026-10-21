import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorNote, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { useOwner } from "./OwnerApp";

type Member = { id: string; phone: string; name: string | null; role: string; location_ids: string[] };

const ROLE_INFO: Record<string, string> = {
  owner: "Everything, incl. payouts and staff",
  manager: "Courts, prices, blocks, refunds",
  staff: "Check-in, walk-ins, calendar",
};

export default function Staff() {
  const { locations } = useOwner();
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ["members"], queryFn: () => api<Member[]>("/owner/members") });
  const [f, setF] = useState({ phone: "", name: "", role: "staff", location_ids: [] as string[] });
  const add = useMutation({
    mutationFn: () => api("/owner/members", { method: "POST", json: f }),
    onSuccess: () => {
      setF({ phone: "", name: "", role: "staff", location_ids: [] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/owner/members/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Squad</p>
        <h1 className="display text-6xl">Staff</h1>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="card p-5">
          {members.isLoading ? <Spinner /> : (
            <ul className="divide-y divide-white/5">
              {members.data?.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <span className="score flex h-10 w-10 items-center justify-center rounded-full bg-lime/15 font-bold text-lime">
                    {(m.name ?? m.phone).slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{m.name ?? "Invited"} <span className="score text-xs text-chalk-mute">+91 {m.phone}</span></p>
                    <p className="text-xs text-chalk-mute">{m.location_ids.length ? m.location_ids.map(locName).join(", ") : "All locations"}</p>
                  </div>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs capitalize">{m.role}</span>
                  {m.role !== "owner" && (
                    <button className="px-2 text-chalk-mute hover:text-flag" onClick={() => remove.mutate(m.id)} aria-label={`Remove ${m.name ?? m.phone}`}>×</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <h2 className="display text-3xl">Add to squad</h2>
          <p className="text-sm text-chalk-dim">They log in with this number via OTP.</p>
          <input className="input score" placeholder="Mobile number" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} required aria-label="Mobile number" />
          <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" />
          <div className="space-y-1.5">
            {(["staff", "manager", "owner"] as const).map((r) => (
              <label key={r} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 ${f.role === r ? "border-lime bg-lime/10" : "border-white/10"}`}>
                <input type="radio" name="role" className="accent-lime" checked={f.role === r} onChange={() => setF({ ...f, role: r })} />
                <span className="font-semibold capitalize">{r}</span>
                <span className="text-xs text-chalk-mute">{ROLE_INFO[r]}</span>
              </label>
            ))}
          </div>
          {f.role !== "owner" && (
            <div>
              <p className="label">Locations (none = all)</p>
              <div className="flex flex-wrap gap-2">
                {locations.map((l) => {
                  const on = f.location_ids.includes(l.id);
                  return (
                    <button type="button" key={l.id} className={`chip ${on ? "chip-on" : ""}`}
                      onClick={() => setF({ ...f, location_ids: on ? f.location_ids.filter((x) => x !== l.id) : [...f.location_ids, l.id] })}>
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <ErrorNote error={add.error} />
          <button className="btn-lime w-full" disabled={add.isPending || f.phone.length !== 10}>Add member</button>
        </form>
      </div>
    </div>
  );
}
