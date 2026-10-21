import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorNote, Spinner, Stat } from "../../components/ui";
import { api, qs } from "../../lib/api";
import { addDays, dayParts, isoDay, rupees } from "../../lib/format";
import { useOwner } from "./OwnerApp";

type Revenue = {
  totals: { gross: number; refunds: number; net: number; online: number; walk_in: number; bookings: number; platform_fees: number };
  days: { date: string; online: number; walk_in: number; bookings: number }[];
  courts: { court: string; location: string; revenue: number; bookings: number }[];
};
type Occupancy = { court: string; location: string; slots: number; booked: number; occupancy: number }[];

// Validated against the dark chart surface (lightness band, CVD and contrast checks pass).
const SERIES = [
  { key: "online", label: "Online", color: "#7FA316" },
  { key: "walk_in", label: "Walk-in / phone", color: "#2B8CC4" },
] as const;

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function Reports() {
  const { locations } = useOwner();
  const today = isoDay(new Date());
  const [days, setDays] = useState(30);
  const [location, setLocation] = useState("");
  const start = addDays(today, -(days - 1));
  const params = qs({ start, end: today, location });
  const revenue = useQuery({ queryKey: ["revenue", params], queryFn: () => api<Revenue>(`/owner/reports/revenue${params}`) });
  const occ = useQuery({ queryKey: ["occupancy", params], queryFn: () => api<Occupancy>(`/owner/reports/occupancy${params}`) });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Season stats</p>
        <h1 className="display text-6xl">Reports</h1>
      </div>
      {/* Filters: one row above the charts */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.days} className={`chip ${days === r.days ? "chip-on" : ""}`} onClick={() => setDays(r.days)}>{r.label}</button>
        ))}
        <select className="input ml-auto w-auto py-2 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {revenue.isLoading ? <Spinner /> : revenue.error ? <ErrorNote error={revenue.error} /> : revenue.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Net revenue" value={rupees(revenue.data.totals.net)} hint={`${rupees(revenue.data.totals.refunds)} refunded`} />
            <Stat label="Bookings" value={revenue.data.totals.bookings.toLocaleString("en-IN")} tone="chalk" hint={`${days}-day window`} />
            <Stat label="Online share" value={`${revenue.data.totals.net ? Math.round((100 * revenue.data.totals.online) / revenue.data.totals.net) : 0}%`} tone="sky" hint={`${rupees(revenue.data.totals.online)} online`} />
            <Stat label="Platform fees" value={rupees(revenue.data.totals.platform_fees)} tone="amber" hint="Per online booking" />
          </div>
          <RevenueChart data={revenue.data.days} />
          <section className="card overflow-x-auto p-5">
            <h2 className="display mb-3 text-3xl">Revenue by court</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-chalk-mute">
                <tr><th className="py-2">Court</th><th>Location</th><th className="text-right">Bookings</th><th className="text-right">Net revenue</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {revenue.data.courts.map((c) => (
                  <tr key={`${c.location}-${c.court}`}>
                    <td className="py-2 font-semibold">{c.court}</td>
                    <td className="text-chalk-dim">{c.location}</td>
                    <td className="score text-right">{c.bookings}</td>
                    <td className="score text-right">{rupees(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="card p-5">
        <h2 className="display text-3xl">Occupancy</h2>
        <p className="mb-4 text-sm text-chalk-mute">Booked slots as a share of open slots, by court.</p>
        {occ.isLoading ? <Spinner /> : occ.data && (
          <ul className="space-y-3">
            {[...occ.data].sort((a, b) => b.occupancy - a.occupancy).map((o) => (
              <li key={`${o.location}-${o.court}`} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate"><span className="font-semibold">{o.court}</span> <span className="text-chalk-mute">· {o.location}</span></span>
                <span className="h-3 rounded-full bg-white/5" title={`${o.booked} of ${o.slots} slots`}>
                  <span className="block h-3 rounded-full bg-[#7FA316]" style={{ width: `${Math.max(o.occupancy, 1)}%` }} />
                </span>
                <span className="score w-14 text-right">{o.occupancy}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Stacked daily revenue (online + walk-in sum to the day's net). */
function RevenueChart({ data }: { data: Revenue["days"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const W = 720;
  const H = 220;
  const pad = { l: 48, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.online + d.walk_in));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / data.length;
  const barW = Math.max(2, Math.min(22, bw - 2));
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const labelEvery = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="display text-3xl">Daily revenue</h2>
        <div className="flex items-center gap-4 text-xs text-chalk-dim">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
          ))}
          <button className="text-lime hover:underline" onClick={() => setShowTable((v) => !v)}>{showTable ? "Chart" : "Table"}</button>
        </div>
      </div>
      {showTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-chalk-mute"><tr><th className="py-1">Date</th><th className="text-right">Online</th><th className="text-right">Walk-in</th><th className="text-right">Bookings</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.date}><td className="score py-1">{d.date}</td><td className="score text-right">{rupees(d.online)}</td><td className="score text-right">{rupees(d.walk_in)}</td><td className="score text-right">{d.bookings}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily revenue split by online and walk-in" onMouseLeave={() => setHover(null)}>
            {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(242,246,239,.08)" />
                <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#7E9488" className="score">{v >= 1000 ? `${v / 1000}k` : v}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = pad.l + i * bw + (bw - barW) / 2;
              const onlineTop = y(d.online);
              const walkTop = y(d.online + d.walk_in);
              const r = Math.min(4, barW / 2);
              return (
                <g key={d.date} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {d.online > 0 && <rect x={x} y={onlineTop} width={barW} height={y(0) - onlineTop} fill={SERIES[0].color} rx={d.walk_in > 0 ? 0 : r} />}
                  {d.walk_in > 0 && <rect x={x} y={walkTop} width={barW} height={Math.max(0, onlineTop - walkTop - 2)} fill={SERIES[1].color} rx={r} />}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#7E9488">{`${dayParts(d.date).day} ${dayParts(d.date).month}`}</text>
                  )}
                  <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
                </g>
              );
            })}
          </svg>
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 rounded-xl border border-white/10 bg-pitch-950/95 px-3 py-2 text-xs shadow-lg"
              style={{ left: `${Math.min(80, ((pad.l + hover * bw) / W) * 100)}%` }}
            >
              <p className="font-semibold">{h.date} · {h.bookings} bookings</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 text-chalk-dim">
                  <i className="h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label}
                  <span className="score ml-auto pl-3 text-chalk">{rupees(h[s.key])}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
}
