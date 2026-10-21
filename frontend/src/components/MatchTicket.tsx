import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { SportIcon, sportName } from "./sport";
import { dayParts, hhmm12, rupees } from "../lib/format";
import type { Booking } from "../lib/types";

/** A booking rendered as a match-day ticket: fixture on top, QR stub below. */
export default function MatchTicket({ bookings, action }: { bookings: Booking[]; action?: React.ReactNode }) {
  const b = bookings[0];
  const last = bookings[bookings.length - 1];
  const d = dayParts(b.date);
  const paid = bookings.reduce((n, x) => n + x.paid_amount, 0);
  const total = bookings.reduce((n, x) => n + x.amount, 0);
  const cancelled = b.status === "cancelled";
  return (
    <article className={`relative overflow-hidden rounded-3xl border ${cancelled ? "border-white/10 opacity-70" : "border-lime/40"} bg-pitch-900`}>
      <div className="turf-night relative p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow flex items-center gap-1.5"><SportIcon sport={b.sport} width={14} height={14} /> {sportName(b.sport)}</p>
            <Link to={`/v/${b.venue.slug}`} className="display mt-1 block text-3xl leading-none hover:text-lime">{b.venue.name}</Link>
            <p className="mt-1 text-sm text-chalk-dim">{b.court.name} · {b.venue.area}, {b.venue.city}</p>
          </div>
          <div className="rounded-xl bg-pitch-950/80 px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-lime">{d.dow}</p>
            <p className="score text-3xl font-bold leading-none">{String(d.day).padStart(2, "0")}</p>
            <p className="text-[10px] uppercase tracking-widest text-chalk-dim">{d.month}</p>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-chalk-mute">Kick-off</p>
            <p className="score text-4xl font-bold text-lime">{hhmm12(b.start)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-chalk-mute">Full time</p>
            <p className="score text-2xl font-bold">{hhmm12(last.end)}</p>
          </div>
        </div>
        {cancelled && (
          <span className="display absolute right-6 top-1/2 -translate-y-1/2 rotate-[-12deg] rounded border-4 border-flag px-3 text-5xl text-flag">
            Cancelled
          </span>
        )}
      </div>
      <div className="perforated flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
        {b.checkin_code && !cancelled ? (
          <>
            <div className="rounded-xl bg-chalk p-2">
              <QRCodeSVG value={`TURFTIME:${b.id}:${b.checkin_code}`} size={84} bgColor="#F2F6EF" fgColor="#05110C" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-chalk-mute">Check-in code</p>
              <p className="score text-2xl font-bold tracking-[0.18em] sm:text-3xl">{b.checkin_code}</p>
              <p className="mt-1 text-xs text-chalk-dim">Show at the front desk</p>
            </div>
          </>
        ) : (
          <div className="flex-1 text-sm text-chalk-dim">
            {cancelled ? (b.refunded_amount ? `Refund ${rupees(b.refunded_amount)} on its way` : "No refund under the venue policy") : b.status === "completed" ? "Played. Good game!" : b.status}
          </div>
        )}
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-widest text-chalk-mute">Paid</p>
          <p className="score text-lg font-bold">{rupees(paid)}</p>
          {paid < total && !cancelled && <p className="whitespace-nowrap text-xs text-amber">{rupees(total - paid)} at venue</p>}
        </div>
      </div>
      {action && <div className="border-t border-white/10 px-5 py-3">{action}</div>}
    </article>
  );
}
