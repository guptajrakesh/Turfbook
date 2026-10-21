import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SportIcon } from "../../components/sport";
import { Empty, Spinner, Stat } from "../../components/ui";
import { hhmm12, isoDay, longDate, rupees } from "../../lib/format";
import { LocationPicker, useOwner } from "./OwnerApp";
import { useCalendar } from "./calendarData";

export default function Matchday() {
  const { locationId, locations } = useOwner();
  const today = isoDay(new Date());
  const cal = useCalendar(locationId, today);
  const loc = locations.find((l) => l.id === locationId);

  const stats = useMemo(() => {
    if (!cal.data) return null;
    const now = new Date().toISOString();
    const all = cal.data.courts.flatMap((c) => c.bookings.map((b) => ({ ...b, courtName: c.name })));
    const live = all.filter((b) => b.status !== "held");
    const slots = cal.data.courts.flatMap((c) => c.slots).filter((s) => s.status !== "blocked");
    const taken = slots.filter((s) => s.status === "booked" || s.status === "held").length;
    return {
      bookings: live.length,
      revenue: live.reduce((n, b) => n + b.paid_amount, 0),
      online: live.filter((b) => b.source === "online").length,
      occupancy: slots.length ? Math.round((100 * taken) / slots.length) : 0,
      checkedIn: live.filter((b) => b.checked_in).length,
      upNext: live.filter((b) => b.ends_at > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 8),
      onNow: live.filter((b) => b.starts_at <= now && b.ends_at > now),
    };
  }, [cal.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{longDate(today)}</p>
          <h1 className="display text-6xl">Matchday</h1>
        </div>
        <LocationPicker />
      </div>

      {cal.isLoading || !stats ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Bookings today" value={stats.bookings} hint={`${stats.online} online · ${stats.bookings - stats.online} walk-in/phone`} />
            <Stat label="Collected" value={rupees(stats.revenue)} tone="chalk" hint="Online + cash, today" />
            <Stat label="Occupancy" value={`${stats.occupancy}%`} tone="amber" hint="Booked vs open slots" />
            <Stat label="Checked in" value={`${stats.checkedIn}/${stats.bookings}`} tone="sky" hint="Players through the gate" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
            <section className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="display text-3xl">Up next</h2>
                <Link to="calendar" className="text-sm font-semibold text-lime hover:underline">Full calendar →</Link>
              </div>
              {stats.upNext.length === 0 ? (
                <Empty title="Quiet pitch">No more bookings today. Share your booking link to fill the evening.</Empty>
              ) : (
                <ol className="divide-y divide-white/5">
                  {stats.upNext.map((b) => {
                    const live = stats.onNow.some((x) => x.id === b.id);
                    return (
                      <li key={b.id} className="flex items-center gap-4 py-3">
                        <span className={`score w-20 text-lg font-bold ${live ? "text-lime" : ""}`}>{hhmm12(b.start)}</span>
                        <span className="rounded-lg bg-pitch-950 p-1.5 text-chalk-dim"><SportIcon sport={b.sport} width={18} height={18} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{b.customer_name || "Player"}</p>
                          <p className="text-xs text-chalk-mute">{b.court.name} · {b.source.replace("_", "-")}</p>
                        </div>
                        {live && <span className="rounded-full bg-lime/15 px-2 py-0.5 text-xs font-bold text-lime">LIVE</span>}
                        {b.checked_in ? (
                          <span className="text-xs font-semibold text-sky">Checked in</span>
                        ) : (
                          <span className="text-xs text-chalk-mute">{b.paid_amount < b.amount ? `Due ${rupees(b.amount - b.paid_amount)}` : "Paid"}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            {loc && <SharePanel slug={loc.slug} name={loc.name} />}
          </div>
        </>
      )}
    </div>
  );
}

function SharePanel({ slug, name }: { slug: string; name: string }) {
  const url = `${window.location.origin}/v/${slug}`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="card turf-night p-5">
      <p className="eyebrow">Your booking link</p>
      <h2 className="display mt-1 text-3xl">Fill the pitch</h2>
      <p className="mt-1 text-sm text-chalk-dim">Print the QR on a poster at the gate or drop the link in your WhatsApp groups.</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="rounded-xl bg-chalk p-2">
          <QRCodeSVG value={url} size={104} bgColor="#F2F6EF" fgColor="#05110C" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-xs text-chalk-dim">{url}</p>
          <button
            className="btn-lime w-full py-2"
            onClick={() =>
              navigator.clipboard?.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <a className="btn-ghost w-full py-2" href={`https://wa.me/?text=${encodeURIComponent(`Book a slot at ${name}: ${url}`)}`} target="_blank" rel="noreferrer">
            Share on WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
