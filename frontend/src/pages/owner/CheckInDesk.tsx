import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { SportIcon, sportName } from "../../components/sport";
import { ErrorNote } from "../../components/ui";
import { api } from "../../lib/api";
import { hhmm12, rupees } from "../../lib/format";
import type { Booking } from "../../lib/types";
import { LocationPicker, useOwner } from "./OwnerApp";

/** Front-desk gate: type the code from the player's ticket (a USB QR scanner types it too). */
export default function CheckInDesk() {
  const { locationId } = useOwner();
  const [code, setCode] = useState("");
  const check = useMutation({
    mutationFn: (c: string) => api<Booking>(`/owner/check-in?location=${locationId}`, { method: "POST", json: { code: c } }),
    onSuccess: () => setCode(""),
  });

  function onChange(v: string) {
    // QR payload is TURFTIME:<booking id>:<code>; accept either form.
    const digits = (v.split(":").pop() ?? "").replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) check.mutate(digits);
  }

  const b = check.data;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Front desk</p>
          <h1 className="display text-6xl">Gate check-in</h1>
        </div>
        <LocationPicker />
      </div>
      <div className="card turf-night p-6">
        <label className="label" htmlFor="gate">Ticket code</label>
        <input
          id="gate"
          className="input score py-4 text-center text-4xl tracking-[0.5em]"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••"
          disabled={check.isPending}
        />
        <p className="mt-2 text-center text-xs text-chalk-mute">Valid for today's bookings at this location.</p>
      </div>
      {check.error && <ErrorNote error={check.error} />}
      {b && (
        <div className="card animate-rise border-lime/60 p-5 shadow-flood" role="status">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lime text-pitch-950">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7" /></svg>
            </span>
            <div className="flex-1">
              <p className="display text-3xl">{b.customer_name || "Player"} is in</p>
              <p className="flex items-center gap-1.5 text-sm text-chalk-dim">
                <SportIcon sport={b.sport} width={15} height={15} /> {sportName(b.sport)} · {b.court.name} · {hhmm12(b.start)}–{hhmm12(b.end)}
              </p>
            </div>
          </div>
          {b.paid_amount < b.amount && (
            <p className="mt-4 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
              Collect balance: <span className="score font-bold">{rupees(b.amount - b.paid_amount)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
