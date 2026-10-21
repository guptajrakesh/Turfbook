import type { Slot } from "../lib/types";
import { rupees } from "../lib/format";

const SESSIONS = [
  { name: "Early", from: 0, to: 9 },
  { name: "Day", from: 9, to: 16 },
  { name: "Evening", from: 16, to: 20 },
  { name: "Night", from: 20, to: 24 },
];

const STATUS_TEXT: Record<string, string> = {
  booked: "Booked",
  held: "On hold",
  blocked: "Closed",
  past: "Gone",
  too_far: "Not open",
};

/** Scoreboard-style tiles, grouped into match sessions of the day. */
export default function SlotGrid({ slots, selected, onToggle }: { slots: Slot[]; selected: string[]; onToggle: (s: Slot) => void }) {
  if (!slots.length) return <p className="py-6 text-center text-chalk-mute">Closed on this day.</p>;
  return (
    <div className="space-y-5">
      {SESSIONS.map((sess) => {
        const list = slots.filter((s) => {
          const h = Number(s.start.slice(0, 2));
          return h >= sess.from && h < sess.to;
        });
        if (!list.length) return null;
        const free = list.filter((s) => s.status === "free").length;
        return (
          <div key={sess.name}>
            <div className="mb-2 flex items-center gap-3">
              <h4 className="display text-xl text-chalk-dim">{sess.name}</h4>
              <span className="h-px flex-1 bg-white/10" />
              <span className="score text-xs text-chalk-mute">{free} free</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {list.map((s) => {
                const on = selected.includes(s.starts_at);
                const free = s.status === "free";
                return (
                  <button
                    key={s.starts_at}
                    disabled={!free}
                    onClick={() => onToggle(s)}
                    aria-pressed={on}
                    aria-label={`${s.start} to ${s.end}, ${free ? rupees(s.price) : STATUS_TEXT[s.status]}`}
                    className={`relative overflow-hidden rounded-xl border px-2 py-2.5 text-left transition ${
                      on
                        ? "border-lime bg-lime text-pitch-950 shadow-flood"
                        : free
                          ? "border-white/10 bg-pitch-950/70 hover:border-lime/60"
                          : "cursor-not-allowed border-white/5 bg-pitch-950/30 text-chalk-mute/60"
                    }`}
                  >
                    {s.label === "Peak" && free && !on && <span className="absolute right-0 top-0 h-full w-1 bg-amber/80" aria-hidden />}
                    <span className={`score block text-lg font-bold leading-none ${!free && !on ? "line-through decoration-1" : ""}`}>{s.start}</span>
                    <span className={`mt-1 block text-[11px] ${on ? "text-pitch-900" : free ? "text-chalk-dim" : ""}`}>
                      {free || on ? rupees(s.price) : STATUS_TEXT[s.status]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-4 text-xs text-chalk-mute">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-lime" /> Your pick</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-white/20" /> Free</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-1 rounded bg-amber" /> Peak price</span>
      </div>
    </div>
  );
}
