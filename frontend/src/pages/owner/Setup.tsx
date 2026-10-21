import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SportIcon, SPORTS } from "../../components/sport";
import { ErrorNote, Modal, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { rupees } from "../../lib/format";
import type { Court } from "../../lib/types";
import { useOwner, type OwnerLocation } from "./OwnerApp";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Setup({ firstRun = false }: { firstRun?: boolean }) {
  const { locations, locationId, setLocationId, role } = useOwner();
  const [adding, setAdding] = useState(firstRun);
  const loc = locations.find((l) => l.id === locationId);
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{firstRun ? "Step 2 of 3" : "Venue setup"}</p>
          <h1 className="display text-6xl">{firstRun ? "Add your ground" : "Grounds & courts"}</h1>
        </div>
        {role === "owner" && !firstRun && <button className="btn-lime" onClick={() => setAdding(true)}>+ Add location</button>}
      </div>

      {firstRun ? (
        <div className="card max-w-2xl p-6">
          <LocationForm
            onSaved={(id) => {
              setLocationId(id);
              navigate("/owner/setup");
            }}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {locations.map((l) => (
              <button key={l.id} onClick={() => setLocationId(l.id)} className={`chip ${l.id === locationId ? "chip-on" : ""}`}>{l.name}</button>
            ))}
          </div>
          {loc && <LocationDetail loc={loc} />}
          {role === "owner" && <PolicyEditor />}
        </>
      )}
      <Modal open={adding && !firstRun} onClose={() => setAdding(false)} title="New location">
        <LocationForm
          onSaved={(id) => {
            setAdding(false);
            setLocationId(id);
          }}
        />
      </Modal>
    </div>
  );
}

function LocationForm({ loc, onSaved }: { loc?: OwnerLocation; onSaved: (id: string) => void }) {
  const { refetch } = useOwner();
  const [f, setF] = useState({
    name: loc?.name ?? "",
    area: loc?.area ?? "",
    city: loc?.city ?? "",
    address: loc?.address ?? "",
    lat: String(loc?.lat ?? ""),
    lng: String(loc?.lng ?? ""),
    open_time: loc?.open_time ?? "06:00",
    close_time: loc?.close_time ?? "23:00",
    amenities: (loc?.amenities ?? ["Floodlights", "Parking"]).join(", "),
    photo_url: loc?.photo_url ?? "",
    description: loc?.description ?? "",
    advance_percent: String(loc?.advance_percent ?? 100),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        lat: Number(f.lat),
        lng: Number(f.lng),
        advance_percent: Number(f.advance_percent),
        amenities: f.amenities.split(",").map((a) => a.trim()).filter(Boolean),
        photo_url: f.photo_url || null,
      };
      return loc
        ? api<OwnerLocation>(`/owner/locations/${loc.id}`, { method: "PUT", json: body })
        : api<OwnerLocation>("/owner/locations", { method: "POST", json: body });
    },
    onSuccess: (l) => {
      refetch();
      onSaved(l.id);
    },
  });
  const pin = () =>
    navigator.geolocation?.getCurrentPosition(({ coords }) =>
      setF((x) => ({ ...x, lat: coords.latitude.toFixed(5), lng: coords.longitude.toFixed(5) })),
    );
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Venue name" className="sm:col-span-2"><input className="input" value={f.name} onChange={set("name")} required /></Field>
      <Field label="Area"><input className="input" value={f.area} onChange={set("area")} placeholder="Andheri West" /></Field>
      <Field label="City"><input className="input" value={f.city} onChange={set("city")} required /></Field>
      <Field label="Address" className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
      <Field label="Map pin (lat, lng)" className="sm:col-span-2">
        <div className="flex gap-2">
          <input className="input score" value={f.lat} onChange={set("lat")} placeholder="19.1364" required />
          <input className="input score" value={f.lng} onChange={set("lng")} placeholder="72.8296" required />
          <button type="button" className="btn-ghost shrink-0" onClick={pin}>I'm here</button>
        </div>
      </Field>
      <Field label="Opens"><input type="time" className="input score" value={f.open_time} onChange={set("open_time")} /></Field>
      <Field label="Closes (00:00 = midnight)"><input type="time" className="input score" value={f.close_time} onChange={set("close_time")} /></Field>
      <Field label="Amenities (comma separated)" className="sm:col-span-2"><input className="input" value={f.amenities} onChange={set("amenities")} /></Field>
      <Field label="Photo URL"><input className="input" value={f.photo_url} onChange={set("photo_url")} placeholder="https://…" /></Field>
      <Field label="Online advance % (100 = full only)"><input className="input score" inputMode="numeric" value={f.advance_percent} onChange={set("advance_percent")} /></Field>
      <div className="sm:col-span-2"><ErrorNote error={save.error} /></div>
      <button className="btn-lime sm:col-span-2" disabled={save.isPending}>{loc ? "Save changes" : "Add location"}</button>
    </form>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function LocationDetail({ loc }: { loc: OwnerLocation }) {
  const [editing, setEditing] = useState(false);
  const [courtModal, setCourtModal] = useState<Court | "new" | null>(null);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      <section className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="display text-3xl">{loc.name}</h2>
            <p className="text-sm text-chalk-mute">{loc.address}</p>
          </div>
          <button className="btn-ghost py-1.5" onClick={() => setEditing(true)}>Edit</button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="label">Hours</dt><dd className="score">{loc.open_time}–{loc.close_time}</dd></div>
          <div><dt className="label">Advance</dt><dd className="score">{loc.advance_percent === 100 ? "Full payment" : `${loc.advance_percent}%`}</dd></div>
          <div className="col-span-2"><dt className="label">Booking link</dt><dd className="truncate text-lime">{window.location.origin}/v/{loc.slug}</dd></div>
        </dl>
        <Modal open={editing} onClose={() => setEditing(false)} title="Edit location">
          <LocationForm loc={loc} onSaved={() => setEditing(false)} />
        </Modal>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-3xl">Courts</h2>
          <button className="btn-lime py-1.5" onClick={() => setCourtModal("new")}>+ Court</button>
        </div>
        {loc.courts.length === 0 && <p className="text-sm text-chalk-mute">Add your first court to start taking bookings.</p>}
        <div className="space-y-2">
          {loc.courts.map((c) => (
            <button key={c.id} onClick={() => setCourtModal(c)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-pitch-950/50 p-3 text-left hover:border-lime/40">
              <span className="flex gap-1 text-lime">{c.sports.map((s) => <SportIcon key={s} sport={s} />)}</span>
              <span className="flex-1">
                <span className="block font-semibold">{c.name} {!c.is_active && <span className="text-xs text-flag">· paused</span>}</span>
                <span className="text-xs text-chalk-mute">{c.surface}</span>
              </span>
              <span className="score text-chalk-dim">{rupees(c.base_price)}/slot</span>
            </button>
          ))}
        </div>
      </section>
      {courtModal && (
        <Modal open onClose={() => setCourtModal(null)} title={courtModal === "new" ? "New court" : courtModal.name}>
          <CourtEditor court={courtModal === "new" ? null : courtModal} locationId={loc.id} onClose={() => setCourtModal(null)} />
        </Modal>
      )}
    </div>
  );
}

type Rules = {
  slot_rule: { slot_minutes: number; buffer_minutes: number; max_advance_days: number; min_notice_minutes: number };
  pricing_rules: { id: string; label: string; day_of_week: number | null; start_time: string; end_time: string; price: number; priority: number }[];
};

function CourtEditor({ court, locationId, onClose }: { court: Court | null; locationId: string; onClose: () => void }) {
  const { refetch } = useOwner();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"basics" | "slots" | "pricing">("basics");
  const [f, setF] = useState({ name: court?.name ?? "", surface: court?.surface ?? "Artificial turf", base_price: String(court?.base_price ?? 1000), sports: court?.sports ?? ["football"], is_active: court?.is_active ?? true });
  const rules = useQuery({ queryKey: ["rules", court?.id], queryFn: () => api<Rules>(`/owner/courts/${court!.id}/rules`), enabled: !!court });
  const [sr, setSr] = useState<Rules["slot_rule"] | null>(null);
  useEffect(() => {
    if (rules.data) setSr(rules.data.slot_rule);
  }, [rules.data]);

  const saveCourt = useMutation({
    mutationFn: () => {
      const body = { ...f, base_price: Number(f.base_price), location_id: locationId };
      return court ? api(`/owner/courts/${court.id}`, { method: "PUT", json: body }) : api("/owner/courts", { method: "POST", json: body });
    },
    onSuccess: () => {
      refetch();
      onClose();
    },
  });
  const saveSlots = useMutation({
    mutationFn: () => api(`/owner/courts/${court!.id}/slot-rule`, { method: "PUT", json: sr }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules", court?.id] }),
  });
  const [pr, setPr] = useState({ label: "Peak", day_of_week: "", start_time: "18:00", end_time: "00:00", price: "1500", priority: "10" });
  const addPrice = useMutation({
    mutationFn: () =>
      api("/owner/pricing-rules", {
        method: "POST",
        json: { court_id: court!.id, ...pr, day_of_week: pr.day_of_week === "" ? null : Number(pr.day_of_week), price: Number(pr.price), priority: Number(pr.priority) },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules", court?.id] }),
  });
  const delPrice = useMutation({
    mutationFn: (id: string) => api(`/owner/pricing-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules", court?.id] }),
  });

  return (
    <div className="space-y-4">
      {court && (
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 p-1">
          {(["basics", "slots", "pricing"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-lime text-pitch-950" : "text-chalk-dim"}`}>{t}</button>
          ))}
        </div>
      )}
      {tab === "basics" && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveCourt.mutate(); }}>
          <Field label="Court name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Sports">
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((s) => {
                const on = f.sports.includes(s.id);
                return (
                  <button type="button" key={s.id} className={`chip ${on ? "chip-on" : ""}`}
                    onClick={() => setF({ ...f, sports: on ? f.sports.filter((x) => x !== s.id) : [...f.sports, s.id] })}>
                    <SportIcon sport={s.id} width={15} height={15} /> {s.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Surface"><input className="input" value={f.surface} onChange={(e) => setF({ ...f, surface: e.target.value })} /></Field>
            <Field label="Base price / slot (₹)"><input className="input score" inputMode="numeric" value={f.base_price} onChange={(e) => setF({ ...f, base_price: e.target.value.replace(/\D/g, "") })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="accent-lime" /> Taking bookings</label>
          <ErrorNote error={saveCourt.error} />
          <button className="btn-lime w-full" disabled={saveCourt.isPending || !f.sports.length}>{court ? "Save court" : "Add court"}</button>
        </form>
      )}
      {tab === "slots" && (rules.isLoading || !sr ? <Spinner /> : (
        <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); saveSlots.mutate(); }}>
          {([["slot_minutes", "Slot length (min)"], ["buffer_minutes", "Buffer between (min)"], ["max_advance_days", "Book ahead (days)"], ["min_notice_minutes", "Min notice (min)"]] as const).map(([k, l]) => (
            <Field key={k} label={l}><input className="input score" inputMode="numeric" value={sr[k]} onChange={(e) => setSr({ ...sr, [k]: Number(e.target.value.replace(/\D/g, "")) })} /></Field>
          ))}
          <div className="col-span-2"><ErrorNote error={saveSlots.error} /></div>
          <button className="btn-lime col-span-2" disabled={saveSlots.isPending}>{saveSlots.isSuccess ? "Saved ✓" : "Save slot rules"}</button>
        </form>
      ))}
      {tab === "pricing" && (rules.isLoading ? <Spinner /> : (
        <div className="space-y-4">
          <p className="text-sm text-chalk-dim">Highest priority wins when rules overlap. Slots no rule covers use the base price ({rupees(court?.base_price)}).</p>
          <ul className="space-y-1.5">
            {rules.data?.pricing_rules.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg bg-pitch-950/60 px-3 py-2 text-sm">
                <span className="w-20 font-semibold">{p.label || "Rule"}</span>
                <span className="flex-1 text-chalk-dim">{p.day_of_week === null ? "Every day" : DAYS[p.day_of_week]} · <span className="score">{p.start_time}–{p.end_time}</span></span>
                <span className="score">{rupees(p.price)}</span>
                <button onClick={() => delPrice.mutate(p.id)} className="px-1 text-chalk-mute hover:text-flag" aria-label="Delete rule">×</button>
              </li>
            ))}
          </ul>
          <form className="grid grid-cols-3 gap-2" onSubmit={(e) => { e.preventDefault(); addPrice.mutate(); }}>
            <input className="input" value={pr.label} onChange={(e) => setPr({ ...pr, label: e.target.value })} aria-label="Label" placeholder="Label" />
            <select className="input" value={pr.day_of_week} onChange={(e) => setPr({ ...pr, day_of_week: e.target.value })} aria-label="Day">
              <option value="">Every day</option>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <input className="input score" value={pr.price} onChange={(e) => setPr({ ...pr, price: e.target.value.replace(/\D/g, "") })} aria-label="Price" placeholder="₹" />
            <input type="time" className="input score" value={pr.start_time} onChange={(e) => setPr({ ...pr, start_time: e.target.value })} aria-label="From" />
            <input type="time" className="input score" value={pr.end_time} onChange={(e) => setPr({ ...pr, end_time: e.target.value })} aria-label="To" />
            <input className="input score" value={pr.priority} onChange={(e) => setPr({ ...pr, priority: e.target.value.replace(/\D/g, "") })} aria-label="Priority" placeholder="Priority" />
            <div className="col-span-3"><ErrorNote error={addPrice.error} /></div>
            <button className="btn-lime col-span-3" disabled={addPrice.isPending}>Add price rule</button>
          </form>
        </div>
      ))}
    </div>
  );
}

function PolicyEditor() {
  const policy = useQuery({ queryKey: ["policy"], queryFn: () => api<{ hours_before: number; refund_percent: number }[]>("/owner/cancellation-policy") });
  const [tiers, setTiers] = useState<{ hours_before: number; refund_percent: number }[] | null>(null);
  useEffect(() => {
    if (policy.data) setTiers(policy.data);
  }, [policy.data]);
  const save = useMutation({ mutationFn: () => api("/owner/cancellation-policy", { method: "PUT", json: tiers }) });
  if (!tiers) return null;
  return (
    <section className="card max-w-xl p-5">
      <h2 className="display text-3xl">Cancellation policy</h2>
      <p className="mb-4 text-sm text-chalk-dim">Refund applied by how many hours before kick-off the player cancels.</p>
      <div className="space-y-2">
        {tiers.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <input className="input score w-20" value={t.hours_before} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, hours_before: Number(e.target.value.replace(/\D/g, "")) } : x)))} aria-label="Hours before" />
            <span className="text-chalk-dim">h or more before →</span>
            <input className="input score w-20" value={t.refund_percent} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, refund_percent: Math.min(100, Number(e.target.value.replace(/\D/g, ""))) } : x)))} aria-label="Refund percent" />
            <span className="text-chalk-dim">% back</span>
            <button className="ml-auto px-2 text-chalk-mute hover:text-flag" onClick={() => setTiers(tiers.filter((_, j) => j !== i))} aria-label="Remove tier">×</button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn-ghost" onClick={() => setTiers([...tiers, { hours_before: 0, refund_percent: 0 }])}>+ Tier</button>
        <button className="btn-lime" onClick={() => save.mutate()} disabled={save.isPending}>{save.isSuccess ? "Saved ✓" : "Save policy"}</button>
      </div>
      <ErrorNote error={save.error} />
    </section>
  );
}
