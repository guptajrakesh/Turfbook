import type { SVGProps } from "react";

export const SPORTS = [
  { id: "football", name: "Football" },
  { id: "cricket", name: "Box cricket" },
  { id: "badminton", name: "Badminton" },
  { id: "pickleball", name: "Pickleball" },
  { id: "tennis", name: "Tennis" },
  { id: "futsal", name: "Futsal" },
] as const;

export const sportName = (id: string) => SPORTS.find((s) => s.id === id)?.name ?? id;

type P = SVGProps<SVGSVGElement> & { sport: string };

/** Line icons drawn on a 24px grid in the same chalk-line weight as the pitch art. */
export function SportIcon({ sport, ...props }: P) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...props}>
      {(() => {
        switch (sport) {
          case "football":
          case "futsal":
            return (
              <g {...common}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" />
                <path d="M12 3v4.5M20.5 9.5l-4.9.6M17.5 19l-3.3-4.7M6.5 19l3.3-4.7M3.5 9.5l4.9.6" />
              </g>
            );
          case "cricket":
            return (
              <g {...common}>
                <path d="M4 20l9.5-9.5M12 9l3-3 3 3-3 3z" />
                <path d="M3 21l2-2" />
                <circle cx="18.5" cy="18.5" r="2.2" />
              </g>
            );
          case "badminton":
            return (
              <g {...common}>
                <path d="M12 21l-1.5-6h3z" />
                <path d="M10.5 15L7 4M13.5 15L17 4M12 15V3.5M9 9h6" />
              </g>
            );
          case "pickleball":
            return (
              <g {...common}>
                <rect x="4" y="3" width="10" height="12" rx="5" />
                <path d="M9 15v6" />
                <circle cx="18" cy="17" r="2.5" />
              </g>
            );
          case "tennis":
            return (
              <g {...common}>
                <circle cx="12" cy="12" r="9" />
                <path d="M5.6 5.6c3.2 3 3.2 9.8 0 12.8M18.4 5.6c-3.2 3-3.2 9.8 0 12.8" />
              </g>
            );
          default:
            return <circle cx="12" cy="12" r="8" {...common} />;
        }
      })()}
    </svg>
  );
}

/** Decorative pitch markings used behind hero sections. */
export function PitchLines({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 240" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="10" y="10" width="380" height="220" rx="4" />
        <line x1="200" y1="10" x2="200" y2="230" />
        <circle cx="200" cy="120" r="34" />
        <circle cx="200" cy="120" r="2.5" fill="currentColor" />
        <rect x="10" y="62" width="58" height="116" />
        <rect x="10" y="94" width="22" height="52" />
        <rect x="332" y="62" width="58" height="116" />
        <rect x="368" y="94" width="22" height="52" />
        <path d="M68 96a30 30 0 0 1 0 48M332 96a30 30 0 0 0 0 48" />
      </g>
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#D4FF3A" />
        <rect x="6" y="8" width="20" height="16" rx="1.5" fill="none" stroke="#05110C" strokeWidth="2" />
        <line x1="16" y1="8" x2="16" y2="24" stroke="#05110C" strokeWidth="2" />
        <circle cx="16" cy="16" r="3.4" fill="none" stroke="#05110C" strokeWidth="2" />
      </svg>
      <span className="display text-2xl tracking-wider">
        Turf<span className="text-lime">Time</span>
      </span>
    </span>
  );
}
