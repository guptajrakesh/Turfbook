import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { SportIcon, sportName } from "../components/sport";
import { ErrorNote, MatchClock, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { longDate, rupees } from "../lib/format";
import { useSession } from "../lib/session";
import type { BookingGroup } from "../lib/types";

type Order = { order_id: string; amount: number; mode: string; key_id: string | null };

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window"));
    document.body.appendChild(s);
  });
}

export default function Checkout() {
  const { groupId } = useParams();
  const { session, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [payMode, setPayMode] = useState<"full" | "advance">("full");
  const [expired, setExpired] = useState(false);

  const group = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api<BookingGroup>(`/bookings/groups/${groupId}`),
    enabled: !!session,
  });

  const waitForConfirmation = useCallback(async () => {
    for (let i = 0; i < 20; i++) {
      const g = await api<BookingGroup>(`/bookings/groups/${groupId}`);
      if (g.status === "confirmed") {
        qc.setQueryData(["group", groupId], g);
        return navigate(`/ticket/${groupId}`, { replace: true });
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }, [groupId, navigate, qc]);

  const pay = useMutation({
    mutationFn: async () => {
      const order = await api<Order>("/payments/order", { method: "POST", json: { group_id: groupId, pay_mode: payMode } });
      if (order.mode === "mock") {
        const r = await api<BookingGroup>("/payments/mock/complete", { method: "POST", json: { order_id: order.order_id } });
        qc.setQueryData(["group", groupId], r);
        if (r.result === "refunded") throw new Error("The slot was taken while you paid. Your money is on its way back.");
        navigate(`/ticket/${groupId}`, { replace: true });
        return;
      }
      await loadRazorpay();
      // Hosted checkout: card data never touches our servers. The webhook confirms the booking.
      new window.Razorpay!({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount * 100,
        currency: "INR",
        name: "TurfTime",
        prefill: { contact: session?.user.phone },
        theme: { color: "#D4FF3A" },
        handler: () => void waitForConfirmation(),
      }).open();
    },
  });

  const release = useMutation({
    mutationFn: () => api(`/bookings/groups/${groupId}/release`, { method: "POST" }),
    onSuccess: () => navigate(-1),
  });
  const onEnd = useCallback(() => setExpired(true), []);

  if (ready && !session) return <Navigate to={`/login?next=/checkout/${groupId}`} replace />;
  if (group.isLoading || !ready) return <Spinner />;
  if (group.error || !group.data) return <div className="pt-8"><ErrorNote error={group.error} /></div>;
  const g = group.data;
  if (g.status === "confirmed") return <Navigate to={`/ticket/${groupId}`} replace />;
  const first = g.bookings[0];
  const due = payMode === "advance" && g.advance_amount ? g.advance_amount : g.total;
  const lapsed = expired || g.status !== "held";

  return (
    <div className="mx-auto max-w-lg space-y-5 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Slot locked</p>
          <h1 className="display text-5xl">Checkout</h1>
        </div>
        {!lapsed && g.hold_expires_at && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-chalk-mute">Time left</p>
            <MatchClock until={g.hold_expires_at} onEnd={onEnd} />
          </div>
        )}
      </div>

      <section className="card turf overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <span className="rounded-xl bg-lime p-2 text-pitch-950"><SportIcon sport={first.sport} width={24} height={24} /></span>
          <div>
            <p className="font-semibold">{first.venue.name}</p>
            <p className="text-sm text-chalk-mute">{first.court.name} · {sportName(first.sport)}</p>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <p className="text-sm text-chalk-dim">{longDate(first.date)}</p>
          {g.bookings.map((b) => (
            <div key={b.id} className="flex justify-between">
              <span className="score text-lg">{b.start} – {b.end}</span>
              <span className="score text-chalk-dim">{rupees(b.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      {g.advance_amount !== null && (
        <section className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment amount">
          {([
            ["full", "Pay in full", g.total],
            ["advance", "Pay advance", g.advance_amount],
          ] as const).map(([mode, label, amt]) => (
            <button
              key={mode}
              role="radio"
              aria-checked={payMode === mode}
              onClick={() => setPayMode(mode)}
              className={`rounded-2xl border p-3 text-left ${payMode === mode ? "border-lime bg-lime/10" : "border-white/10 hover:border-lime/40"}`}
            >
              <p className="text-sm text-chalk-dim">{label}</p>
              <p className="score text-xl font-bold">{rupees(amt)}</p>
              {mode === "advance" && <p className="text-xs text-chalk-mute">Rest at the venue</p>}
            </button>
          ))}
        </section>
      )}

      {lapsed ? (
        <div className="space-y-3">
          <ErrorNote error={new Error("Full time! Your 10-minute hold ran out and the slot was released.")} />
          <Link to={`/v/${first.venue.slug}?date=${first.date}`} className="btn-lime w-full">Pick again</Link>
        </div>
      ) : (
        <>
          <ErrorNote error={pay.error} />
          <button className="btn-lime w-full py-3.5 text-base" onClick={() => pay.mutate()} disabled={pay.isPending}>
            {pay.isPending ? "Processing…" : `Pay ${rupees(due)}`}
          </button>
          <p className="text-center text-xs text-chalk-mute">UPI, cards and wallets via a secure hosted checkout.</p>
          <button className="w-full text-center text-sm text-chalk-mute hover:text-flag" onClick={() => release.mutate()}>
            Release these slots
          </button>
        </>
      )}
    </div>
  );
}
