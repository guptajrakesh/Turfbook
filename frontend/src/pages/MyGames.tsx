import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import MatchTicket from "../components/MatchTicket";
import { Empty, ErrorNote, Modal, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { rupees } from "../lib/format";
import { useSession } from "../lib/session";
import type { Booking } from "../lib/types";

type Quote = { refund_percent: number; refund: number; hours_before: number; policy: { hours_before: number; refund_percent: number }[] };

export default function MyGames() {
  const { session, ready } = useSession();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const games = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => api<{ upcoming: Booking[]; past: Booking[] }>("/me/bookings"),
    enabled: !!session,
  });

  if (ready && !session) return <Navigate to="/login?next=/games" replace />;
  const list = games.data?.[tab] ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-6">
      <div className="flex items-end justify-between">
        <h1 className="display text-6xl">My games</h1>
        <div className="flex rounded-xl border border-white/10 p-1" role="tablist">
          {(["upcoming", "past"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-lime text-pitch-950" : "text-chalk-dim"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {games.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title={tab === "upcoming" ? "No fixtures yet" : "No match history"}>
          <Link to="/" className="text-lime hover:underline">Find a court near you</Link>
        </Empty>
      ) : (
        <div className="space-y-4">
          {list.map((b) => (
            <MatchTicket
              key={b.id}
              bookings={[b]}
              action={
                tab === "upcoming" ? (
                  <button className="text-sm font-semibold text-chalk-mute hover:text-flag" onClick={() => setCancelling(b)}>
                    Cancel booking
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
      {cancelling && <CancelModal booking={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}

function CancelModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const qc = useQueryClient();
  const quote = useQuery({ queryKey: ["quote", booking.id], queryFn: () => api<Quote>(`/bookings/${booking.id}/cancel-quote`) });
  const cancel = useMutation({
    mutationFn: () => api<{ refund: number }>(`/bookings/${booking.id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title="Cancel booking?">
      {quote.isLoading ? <Spinner /> : quote.data && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-pitch-950/60 p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-chalk-mute">You get back</p>
            <p className="score text-4xl font-bold text-lime">{rupees(quote.data.refund)}</p>
            <p className="text-sm text-chalk-dim">{quote.data.refund_percent}% · {quote.data.hours_before} h before kick-off</p>
          </div>
          <div>
            <p className="label">Venue policy</p>
            <ul className="space-y-1 text-sm text-chalk-dim">
              {quote.data.policy.map((t) => (
                <li key={t.hours_before} className="flex justify-between">
                  <span>{t.hours_before === 0 ? "Less than the above" : `${t.hours_before} h or more before`}</span>
                  <span className="score">{t.refund_percent}%</span>
                </li>
              ))}
            </ul>
          </div>
          <ErrorNote error={cancel.error} />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={onClose}>Keep it</button>
            <button className="btn-danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending ? "Cancelling…" : "Cancel booking"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
