import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SportIcon, sportName } from "../../components/sport";
import { DateStrip, ErrorNote, Modal, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { addDays, isoDay, longDate, rupees } from "../../lib/format";
import type { Booking, Slot } from "../../lib/types";
import { LocationPicker, useOwner } from "./OwnerApp";
import { blockAt, bookingAt, useCalendar, type CalendarCourt } from "./calendarData";

type Pick = { court: CalendarCourt; slot: Slot } | null;

export default function Calendar() {
  const { locationId, role } = useOwner();
  const today = isoDay(new Date());
  const [date, setDate] = useState(today);
  const cal = useCalendar(locationId, date);
  const [freePick, setFreePick] = useState<Pick>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["calendar", locationId] });

  const courts = cal.data?.courts ?? [];
  const times = courts[0]?.slots ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{longDate(date)}</p>
          <h1 className="display text-6xl">Calendar</h1>
        </div>
        <LocationPicker />
      </div>
      <DateStrip value={date} onChange={setDate} start={addDays(today, -1)} days={15} />

      {cal.isLoading ? (
        <Spinner />
      ) : cal.error ? (
        <ErrorNote error={cal.error} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-20 bg-pitch-900 p-3 text-left text-xs uppercase tracking-widest text-chalk-mute">Time</th>
                {courts.map((c) => (
                  <th key={c.id} className="border-l border-white/5 p-3 text-left">
                    <p className="font-semibold">{c.name}</p>
                    <p className="flex gap-1 text-chalk-mute">{c.sports.map((s) => <SportIcon key={s} sport={s} width={14} height={14} />)}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((t, row) => (
                <tr key={t.starts_at}>
                  <td className="score sticky left-0 z-10 border-t border-white/5 bg-pitch-900 px-3 py-1.5 text-chalk-dim">{t.start}</td>
                  {courts.map((c) => {
                    const slot = c.slots[row];
                    if (!slot) return <td key={c.id} className="border-l border-t border-white/5" />;
                    const b = bookingAt(c, slot);
                    const blk = blockAt(c, slot);
                    return (
                      <td key={c.id} className="border-l border-t border-white/5 p-1">
                        {b ? (
                          <button
                            onClick={() => setBooking(b)}
                            className={`w-full rounded-lg border-l-4 px-2 py-1.5 text-left transition hover:brightness-125 ${
                              b.status === "held"
                                ? "border-amber bg-amber/10"
                                : b.source === "online"
                                  ? "border-lime bg-lime/10"
                                  : "border-sky bg-sky/10"
                            }`}
                          >
                            <span className="block truncate font-semibold">{b.customer_name || "Player"}</span>
                            <span className="flex items-center gap-1 text-[11px] text-chalk-dim">
                              {b.status === "held" ? "Paying…" : b.source.replace("_", "-")}
                              {b.checked_in && <span className="text-sky">· in</span>}
                              {b.status === "no_show" && <span className="text-flag">· no-show</span>}
                            </span>
                          </button>
                        ) : blk ? (
                          <div className="rounded-lg bg-[repeating-linear-gradient(135deg,rgba(255,90,78,.12)_0_6px,transparent_6px_12px)] px-2 py-1.5 text-[11px] text-flag">{blk.reason}</div>
                        ) : slot.status === "free" || slot.status === "past" ? (
                          <button
                            onClick={() => setFreePick({ court: c, slot })}
                            disabled={slot.status === "past"}
                            className="group w-full rounded-lg px-2 py-1.5 text-left text-chalk-mute transition hover:bg-white/5 disabled:opacity-40"
                          >
                            <span className="score text-xs">{rupees(slot.price)}</span>
                            <span className="ml-1 hidden text-[11px] text-lime group-hover:inline">+ add</span>
                          </button>
                        ) : (
                          <div className="px-2 py-1.5 text-[11px] text-chalk-mute">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-xs text-chalk-mute">
        <span className="flex items-center gap-1.5"><i className="h-3 w-1 bg-lime" /> Online</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-1 bg-sky" /> Walk-in / phone</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-1 bg-amber" /> Hold, payment in progress</span>
      </div>

      {freePick && <FreeSlotModal pick={freePick} canBlock={role !== "staff"} onClose={() => setFreePick(null)} onDone={refresh} />}
      {booking && <BookingModal booking={booking} canCancel={role !== "staff"} onClose={() => setBooking(null)} onDone={refresh} />}
    </div>
  );
}

function FreeSlotModal({ pick, canBlock, onClose, onDone }: { pick: NonNullable<Pick>; canBlock: boolean; onClose: () => void; onDone: () => void }) {
  const { court, slot } = pick;
  const [mode, setMode] = useState<"walk_in" | "phone" | "block">("walk_in");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sport, setSport] = useState(court.sports[0]);
  const [cash, setCash] = useState(String(slot.price));
  const [reason, setReason] = useState("Maintenance");
  const save = useMutation({
    mutationFn: () =>
      mode === "block"
        ? api("/owner/blocks", { method: "POST", json: { court_id: court.id, starts_at: slot.starts_at, ends_at: slot.ends_at, reason } })
        : api("/owner/bookings/walk-in", {
            method: "POST",
            json: { court_id: court.id, starts_at: [slot.starts_at], customer_name: name, customer_phone: phone, sport, source: mode, paid_amount: Number(cash) || 0 },
          }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={`${slot.start}–${slot.end}`}>
      <p className="-mt-3 mb-4 text-sm text-chalk-dim">{court.name} · {rupees(slot.price)}</p>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-white/10 p-1">
        {(["walk_in", "phone", ...(canBlock ? ["block"] : [])] as const).map((m) => (
          <button key={m} onClick={() => setMode(m as typeof mode)} className={`rounded-lg py-1.5 text-sm font-semibold ${mode === m ? "bg-lime text-pitch-950" : "text-chalk-dim"}`}>
            {m === "walk_in" ? "Walk-in" : m === "phone" ? "Phone" : "Block"}
          </button>
        ))}
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {mode === "block" ? (
          <div>
            <label className="label" htmlFor="reason">Reason</label>
            <input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="cname">Customer name</label>
              <input id="cname" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cphone">Phone</label>
                <input id="cphone" className="input" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} />
              </div>
              <div>
                <label className="label" htmlFor="cash">Cash collected (₹)</label>
                <input id="cash" className="input score" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
            {court.sports.length > 1 && (
              <div className="flex gap-2">
                {court.sports.map((s) => (
                  <button type="button" key={s} onClick={() => setSport(s)} className={`chip ${sport === s ? "chip-on" : ""}`}>{sportName(s)}</button>
                ))}
              </div>
            )}
          </>
        )}
        <ErrorNote error={save.error} />
        <button className="btn-lime w-full" disabled={save.isPending}>
          {mode === "block" ? "Block slot" : "Add booking"}
        </button>
      </form>
    </Modal>
  );
}

function BookingModal({ booking: b, canCancel, onClose, onDone }: { booking: Booking; canCancel: boolean; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const done = () => {
    onDone();
    onClose();
  };
  const checkIn = useMutation({ mutationFn: () => api(`/owner/bookings/${b.id}/check-in`, { method: "POST", json: { code } }), onSuccess: done });
  const cancel = useMutation({
    mutationFn: (full: boolean) => api(`/owner/bookings/${b.id}/cancel?full_refund=${full}`, { method: "POST" }),
    onSuccess: done,
  });
  const noShow = useMutation({ mutationFn: () => api(`/owner/bookings/${b.id}/no-show`, { method: "POST" }), onSuccess: done });
  const started = new Date(b.starts_at) <= new Date();
  return (
    <Modal open onClose={onClose} title={b.customer_name || "Booking"}>
      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="label">When</dt><dd className="score">{b.start}–{b.end}</dd></div>
        <div><dt className="label">Court</dt><dd>{b.court.name}</dd></div>
        <div><dt className="label">Sport</dt><dd className="flex items-center gap-1"><SportIcon sport={b.sport} width={16} height={16} /> {sportName(b.sport)}</dd></div>
        <div><dt className="label">Channel</dt><dd className="capitalize">{b.source.replace("_", "-")}</dd></div>
        <div><dt className="label">Paid</dt><dd className="score">{rupees(b.paid_amount)} / {rupees(b.amount)}</dd></div>
        <div><dt className="label">Phone</dt><dd className="score">{b.customer_phone || "—"}</dd></div>
      </dl>
      {b.status === "confirmed" && !b.checked_in && (
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            checkIn.mutate();
          }}
        >
          <input className="input score tracking-[0.3em]" placeholder="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Check-in code" />
          <button className="btn-lime shrink-0" disabled={code.length !== 6 || checkIn.isPending}>Check in</button>
        </form>
      )}
      {b.checked_in && <p className="mb-3 rounded-xl bg-sky/10 px-3 py-2 text-sm text-sky">Checked in</p>}
      <ErrorNote error={checkIn.error || cancel.error || noShow.error} />
      <div className="mt-3 flex flex-wrap gap-2">
        {b.status === "confirmed" && started && !b.checked_in && (
          <button className="btn-ghost" onClick={() => noShow.mutate()}>Mark no-show</button>
        )}
        {canCancel && (b.status === "confirmed" || b.status === "held") && !started && (
          <>
            <button className="btn-danger" onClick={() => cancel.mutate(false)}>Cancel (policy refund)</button>
            <button className="btn-danger" onClick={() => cancel.mutate(true)}>Cancel, full refund</button>
          </>
        )}
      </div>
    </Modal>
  );
}
