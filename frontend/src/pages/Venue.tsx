import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import LoginForm from "../components/LoginForm";
import SlotGrid from "../components/SlotGrid";
import { SportIcon, sportName } from "../components/sport";
import { DateStrip, ErrorNote, Modal, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { hideBroken } from "../lib/format";
import { hhmm12, isoDay, longDate, rupees } from "../lib/format";
import { useSession } from "../lib/session";
import type { BookingGroup, Court, Slot, Venue } from "../lib/types";

const MAX_SLOTS = 6;

export default function VenuePage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useSession();
  const today = isoDay(new Date());
  const date = params.get("date") || today;
  const sportParam = params.get("sport") || "";

  const venue = useQuery({ queryKey: ["venue", slug], queryFn: () => api<Venue>(`/venues/${slug}`) });
  const courts = useMemo(() => venue.data?.courts ?? [], [venue.data]);
  const [courtId, setCourtId] = useState<string>("");
  const court: Court | undefined = courts.find((c) => c.id === courtId) ?? courts.find((c) => !sportParam || c.sports.includes(sportParam)) ?? courts[0];
  const [sport, setSport] = useState("");
  const activeSport = sport && court?.sports.includes(sport) ? sport : court?.sports.includes(sportParam) ? sportParam : court?.sports[0] ?? "";
  const [selected, setSelected] = useState<Slot[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => setSelected([]), [court?.id, date]);

  const slots = useQuery({
    queryKey: ["slots", court?.id, date],
    queryFn: () => api<{ slots: Slot[] }>(`/courts/${court!.id}/slots?date=${date}`),
    enabled: !!court,
    refetchInterval: 30_000, // live availability
  });

  const hold = useMutation({
    mutationFn: () =>
      api<BookingGroup>("/bookings/hold", {
        method: "POST",
        json: { court_id: court!.id, starts_at: selected.map((s) => s.starts_at), sport: activeSport },
      }),
    onSuccess: (g) => navigate(`/checkout/${g.group_id}`),
    onError: () => qc.invalidateQueries({ queryKey: ["slots", court?.id, date] }),
  });

  function toggle(s: Slot) {
    setSelected((cur) => {
      if (cur.some((x) => x.starts_at === s.starts_at)) return cur.filter((x) => x.starts_at !== s.starts_at);
      if (cur.length >= MAX_SLOTS) return cur;
      return [...cur, s].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    });
  }

  function book() {
    if (!session) setLoginOpen(true);
    else hold.mutate();
  }

  if (venue.isLoading) return <Spinner label="Walking out of the tunnel" />;
  if (venue.error || !venue.data) return <div className="pt-8"><ErrorNote error={venue.error ?? new Error("Venue not found")} /></div>;
  const v = venue.data;
  const total = selected.reduce((n, s) => n + s.price, 0);

  return (
    <div className="pb-32 pt-4">
      {/* Stadium banner */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        <div className="turf h-56 sm:h-72">
          {v.photo_url && <img src={v.photo_url} alt={`${v.name} court`} onError={hideBroken} className="h-full w-full object-cover opacity-60" />}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-pitch-950 via-pitch-950/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <p className="eyebrow">{v.business}</p>
          <h1 className="display mt-1 text-5xl sm:text-7xl">{v.name}</h1>
          <p className="mt-2 text-sm text-chalk-dim">
            {v.address} · Open <span className="score">{v.open_time}–{v.close_time === "00:00" ? "24:00" : v.close_time}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {v.amenities.map((a) => (
              <span key={a} className="rounded-full bg-pitch-950/70 px-2.5 py-1 text-xs text-chalk-dim">{a}</span>
            ))}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-lime/15 px-2.5 py-1 text-xs font-semibold text-lime hover:bg-lime/25"
            >
              Directions ↗
            </a>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Court picker */}
          <section>
            <h2 className="label">Choose your court</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {courts.map((c) => {
                const on = c.id === court?.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCourtId(c.id)}
                    className={`flex items-center justify-between rounded-2xl border p-3 text-left transition ${on ? "border-lime bg-lime/10" : "border-white/10 bg-pitch-900/60 hover:border-lime/40"}`}
                  >
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-chalk-mute">{c.surface}</p>
                    </div>
                    <div className="flex items-center gap-1 text-chalk-dim">
                      {c.sports.map((s) => <SportIcon key={s} sport={s} width={18} height={18} />)}
                    </div>
                  </button>
                );
              })}
            </div>
            {court && court.sports.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {court.sports.map((s) => (
                  <button key={s} onClick={() => setSport(s)} className={`chip ${s === activeSport ? "chip-on" : ""}`}>
                    <SportIcon sport={s} width={16} height={16} /> {sportName(s)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="label">Match day</h2>
            <DateStrip
              value={date}
              start={today}
              days={14}
              onChange={(d) => {
                params.set("date", d);
                setParams(params, { replace: true });
              }}
            />
          </section>

          <section className="card turf p-4 sm:p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="display text-3xl">{longDate(date)}</h2>
              <span className="text-xs text-chalk-mute">Updates live</span>
            </div>
            {slots.isLoading ? <Spinner /> : slots.error ? <ErrorNote error={slots.error} /> : (
              <SlotGrid slots={slots.data!.slots} selected={selected.map((s) => s.starts_at)} onToggle={toggle} />
            )}
          </section>
        </div>

        {/* Team-sheet summary (desktop) */}
        <aside className="hidden lg:block">
          <div className="card sticky top-20 space-y-4 p-5">
            <MatchSummary venue={v} court={court} sport={activeSport} selected={selected} total={total} />
            <ErrorNote error={hold.error} />
            <button className="btn-lime w-full py-3 text-base" disabled={!selected.length || hold.isPending} onClick={book}>
              {hold.isPending ? "Locking slot…" : selected.length ? `Book · ${rupees(total)}` : "Pick a slot"}
            </button>
            <p className="text-center text-xs text-chalk-mute">Slots are held for 10 minutes while you pay.</p>
          </div>
        </aside>
      </div>

      {/* Sticky bar (mobile) */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-lime/30 bg-pitch-900/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="flex-1">
              <p className="score text-lg font-bold text-lime">{rupees(total)}</p>
              <p className="text-xs text-chalk-dim">
                {selected.length} slot{selected.length > 1 ? "s" : ""} · {hhmm12(selected[0].start)} · {court?.name}
              </p>
            </div>
            <button className="btn-lime px-6 py-3" disabled={hold.isPending} onClick={book}>
              {hold.isPending ? "Locking…" : "Book now"}
            </button>
          </div>
          {hold.error && <div className="mx-auto mt-2 max-w-6xl"><ErrorNote error={hold.error} /></div>}
        </div>
      )}

      <Modal open={loginOpen} onClose={() => setLoginOpen(false)} title="Quick sign-in">
        <p className="mb-4 text-sm text-chalk-dim">Your picks are saved. Verify your number to lock them in.</p>
        <LoginForm
          cta="Verify & book"
          onDone={() => {
            setLoginOpen(false);
            hold.mutate();
          }}
        />
      </Modal>
    </div>
  );
}

function MatchSummary({ venue, court, sport, selected, total }: { venue: Venue; court?: Court; sport: string; selected: Slot[]; total: number }) {
  return (
    <div>
      <p className="eyebrow">Your booking</p>
      <h3 className="display mt-1 text-3xl">{court?.name ?? "—"}</h3>
      <p className="text-sm text-chalk-mute">{venue.name} · {sportName(sport)}</p>
      <ul className="mt-4 space-y-1.5">
        {selected.length === 0 && <li className="text-sm text-chalk-mute">Tap free slots to add them (up to {MAX_SLOTS}).</li>}
        {selected.map((s) => (
          <li key={s.starts_at} className="flex justify-between rounded-lg bg-pitch-950/60 px-3 py-1.5 text-sm">
            <span className="score">{s.start}–{s.end}</span>
            <span className="score text-chalk-dim">{rupees(s.price)}</span>
          </li>
        ))}
      </ul>
      {selected.length > 0 && (
        <div className="mt-3 flex justify-between border-t border-white/10 pt-3">
          <span className="text-sm text-chalk-dim">Total</span>
          <span className="score text-xl font-bold text-lime">{rupees(total)}</span>
        </div>
      )}
    </div>
  );
}
