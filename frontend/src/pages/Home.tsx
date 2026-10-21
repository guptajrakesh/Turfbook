import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PitchLines, SportIcon, SPORTS, sportName } from "../components/sport";
import { DateStrip, Empty, ErrorNote, Modal } from "../components/ui";
import { api, qs } from "../lib/api";
import { hhmm12, hideBroken, isoDay, rupees } from "../lib/format";
import { usePlace } from "../lib/session";
import type { Venue } from "../lib/types";

export default function Home() {
  const { place, locating, error: geoError, detect, choose } = usePlace();
  const [sport, setSport] = useState<string>("");
  const today = isoDay(new Date());
  const [date, setDate] = useState(today);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");

  const hasGps = place?.lat !== undefined && place?.lng !== undefined;
  const venues = useQuery({
    queryKey: ["venues", place?.lat, place?.lng, place?.city, sport, date, q],
    queryFn: () =>
      api<{ venues: Venue[]; radius_km: number | null }>(
        `/venues${qs({ lat: place?.lat, lng: place?.lng, city: hasGps ? undefined : place?.city, sport, date, q })}`,
      ),
  });
  const placeLabel = place ? [place.area, place.city].filter(Boolean).join(", ") || "Near you" : null;

  return (
    <div className="space-y-8 pt-4">
      {/* Hero: night match under floodlights */}
      <section className="turf-night relative overflow-hidden rounded-3xl border border-white/10 px-5 pb-6 pt-8 sm:px-10 sm:pt-12">
        <PitchLines className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.07]" />
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-lime/20 blur-3xl animate-pulseLine" aria-hidden />
        <div className="relative max-w-2xl">
          <p className="eyebrow">Live slots · Instant confirmation</p>
          <h1 className="display mt-3 text-[3.4rem] sm:text-[5.5rem]">
            Game on.
            <br />
            <span className="text-lime">Book the turf.</span>
          </h1>
          <p className="mt-3 max-w-md text-chalk-dim">
            Find courts near you, see what's free right now and lock your slot in under a minute.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button onClick={() => setPicker(true)} className="chip border-lime/40 bg-pitch-950/60 text-chalk">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#D4FF3A" strokeWidth="2" aria-hidden>
                <path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {locating ? "Finding you…" : placeLabel ?? "Choose location"}
              <span className="text-lime">· Change</span>
            </button>
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Search venues</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search venue or area" className="input bg-pitch-950/60 py-2" />
            </label>
          </div>
        </div>
      </section>

      {/* Location explainer shown before the browser permission prompt */}
      {!place && !locating && (
        <section className="card flex flex-col gap-4 border-lime/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Show courts closest to you first?</p>
            <p className="text-sm text-chalk-dim">We use your location once to sort venues by distance. It is never stored.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={detect} className="btn-lime">Use my location</button>
            <button onClick={() => setPicker(true)} className="btn-ghost">Pick a city</button>
          </div>
        </section>
      )}
      {geoError && <ErrorNote error={new Error(geoError)} />}

      {/* Sport + date */}
      <section className="space-y-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <button onClick={() => setSport("")} className={`chip shrink-0 ${sport === "" ? "chip-on" : ""}`}>
            All sports
          </button>
          {SPORTS.map((s) => (
            <button key={s.id} onClick={() => setSport(s.id)} className={`chip shrink-0 ${sport === s.id ? "chip-on" : ""}`}>
              <SportIcon sport={s.id} width={16} height={16} />
              {s.name}
            </button>
          ))}
        </div>
        <DateStrip value={date} onChange={setDate} start={today} days={7} />
      </section>

      {/* Fixtures list */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="display text-4xl">{hasGps ? "Nearest to you" : place?.city ? `Venues in ${place.city}` : "All venues"}</h2>
          {venues.data && (
            <span className="text-sm text-chalk-mute">
              {venues.data.venues.length} venues{venues.data.radius_km ? ` within ${venues.data.radius_km} km` : ""}
            </span>
          )}
        </div>
        {venues.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="card h-72 animate-pulse" />
            ))}
          </div>
        ) : venues.error ? (
          <ErrorNote error={venues.error} />
        ) : venues.data!.venues.length === 0 ? (
          <Empty title="No courts here yet">Try another sport or city. New venues join every week.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {venues.data!.venues.map((v, i) => (
              <VenueCard key={v.id} venue={v} sport={sport} date={date} index={i} />
            ))}
          </div>
        )}
      </section>

      <CityPicker
        open={picker}
        onClose={() => setPicker(false)}
        onGps={() => {
          detect();
          setPicker(false);
        }}
        onPick={(c) => {
          choose(c);
          setPicker(false);
        }}
      />
    </div>
  );
}

function VenueCard({ venue: v, sport, date, index }: { venue: Venue; sport: string; date: string; index: number }) {
  return (
    <Link
      to={`/v/${v.slug}?date=${date}${sport ? `&sport=${sport}` : ""}`}
      className="card group animate-rise overflow-hidden transition hover:-translate-y-0.5 hover:border-lime/50 hover:shadow-flood"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="relative h-36 overflow-hidden turf">
        {v.photo_url && (
          <img src={v.photo_url} alt="" loading="lazy" onError={hideBroken} className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-90" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-pitch-900 via-pitch-900/30 to-transparent" />
        {v.distance_km !== null && v.distance_km !== undefined && (
          <span className="score absolute left-3 top-3 rounded-md bg-pitch-950/80 px-2 py-0.5 text-sm font-bold text-lime">
            {v.distance_km < 1 ? `${Math.round(v.distance_km * 1000)} m` : `${v.distance_km} km`}
          </span>
        )}
        <div className="absolute right-3 top-3 flex gap-1">
          {v.sports.slice(0, 4).map((s) => (
            <span key={s} title={sportName(s)} className="rounded-full bg-pitch-950/80 p-1.5 text-chalk">
              <SportIcon sport={s} width={15} height={15} />
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="display text-2xl leading-none">{v.name}</h3>
          <p className="mt-1 text-sm text-chalk-mute">
            {v.area}, {v.city} · {v.courts_count} {v.courts_count === 1 ? "court" : "courts"}
          </p>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-pitch-950/60 px-3 py-2">
          {v.next_slot ? (
            <>
              <span className="text-xs uppercase tracking-wider text-chalk-mute">Next kick-off</span>
              <span className="score font-bold text-lime">{hhmm12(v.next_slot.start)}</span>
              <span className="score text-sm text-chalk">{rupees(v.next_slot.price)}</span>
            </>
          ) : (
            <span className="text-sm text-chalk-mute">Fully booked this day</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CityPicker({ open, onClose, onPick, onGps }: { open: boolean; onClose: () => void; onPick: (c: string) => void; onGps: () => void }) {
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<{ city: string; venues: number }[]>("/cities"), enabled: open });
  return (
    <Modal open={open} onClose={onClose} title="Where are you playing?">
      <button onClick={onGps} className="btn-lime mb-4 w-full">
        Use my current location
      </button>
      <p className="label">Or pick a city</p>
      <div className="grid grid-cols-2 gap-2">
        {cities.data?.map((c) => (
          <button key={c.city} onClick={() => onPick(c.city)} className="btn-ghost justify-between">
            {c.city}
            <span className="score text-xs text-chalk-mute">{c.venues}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
