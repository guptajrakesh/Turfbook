import { useEffect, useRef, useState, type ReactNode } from "react";
import { addDays, dayParts, isoDay } from "../lib/format";

export function DateStrip({ value, onChange, start, days = 10 }: { value: string; onChange: (d: string) => void; start: string; days?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const today = isoDay(new Date());
  const tomorrow = addDays(today, 1);
  return (
    <div ref={ref} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Match day">
      {Array.from({ length: days }, (_, i) => addDays(start, i)).map((d) => {
        const p = dayParts(d);
        const on = d === value;
        return (
          <button
            key={d}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(d)}
            className={`flex min-w-[62px] flex-col items-center rounded-xl border px-2 py-2 transition ${
              on ? "border-lime bg-lime text-pitch-950 shadow-flood" : "border-white/10 bg-pitch-900/70 text-chalk-dim hover:border-lime/50"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest">{d === today ? "Today" : d === tomorrow ? "Tmrw" : p.dow}</span>
            <span className="score text-2xl font-bold leading-tight">{String(p.day).padStart(2, "0")}</span>
            <span className="text-[10px] uppercase tracking-widest opacity-80">{p.month}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-rise rounded-t-3xl border border-white/10 bg-pitch-900 p-5 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="display text-3xl">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-chalk-dim hover:text-lime" aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-chalk-dim" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-lime border-t-transparent" />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card turf flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="display text-3xl">{title}</p>
      <div className="max-w-sm text-sm text-chalk-dim">{children}</div>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="rounded-xl border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">{(error as Error).message}</p>;
}

/** Match clock counting down to an ISO time; calls onEnd once at zero. */
export function MatchClock({ until, onEnd }: { until: string; onEnd?: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const ms = Math.max(0, new Date(until).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) {
        clearInterval(t);
        onEnd?.();
      }
    }, 250);
    return () => clearInterval(t);
  }, [until, onEnd]);
  const s = Math.ceil(left / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className={`score rounded-lg bg-pitch-950 px-2.5 py-1 text-xl font-bold ${s < 60 ? "text-flag" : "text-amber"}`} aria-live="off">
      {mm}:{ss}
    </span>
  );
}

export function Stat({ label, value, hint, tone = "lime" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "lime" | "amber" | "sky" | "chalk" }) {
  const color = { lime: "text-lime", amber: "text-amber", sky: "text-sky", chalk: "text-chalk" }[tone];
  return (
    <div className="card relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-chalk-mute">{label}</p>
      <p className={`score mt-1 text-3xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-chalk-dim">{hint}</p>}
    </div>
  );
}
