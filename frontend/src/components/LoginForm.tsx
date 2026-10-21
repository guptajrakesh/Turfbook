import { useState } from "react";
import { api, applySession, type Session } from "../lib/api";
import { ErrorNote } from "./ui";

/** Phone-first OTP login, the norm for Indian players and venue staff. */
export default function LoginForm({ onDone, cta = "Continue" }: { onDone?: (s: Session) => void; cta?: string }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ dev_code: string | null }>("/auth/otp/send", { method: "POST", json: { phone } });
      setDevCode(r.dev_code);
      setStep("code");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api<Session>("/auth/otp/verify", { method: "POST", json: { phone, code, name: name || undefined } });
      applySession(s);
      onDone?.(s);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return step === "phone" ? (
    <form onSubmit={send} className="space-y-4">
      <div>
        <label className="label" htmlFor="phone">Mobile number</label>
        <div className="flex">
          <span className="score flex items-center rounded-l-xl border border-r-0 border-white/15 bg-pitch-850 px-3 text-chalk-dim">+91</span>
          <input
            id="phone"
            className="input rounded-l-none score text-lg tracking-wider"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
        </div>
      </div>
      <ErrorNote error={error} />
      <button className="btn-lime w-full" disabled={busy || phone.length !== 10}>
        {busy ? "Sending…" : "Get OTP"}
      </button>
    </form>
  ) : (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-chalk-dim">
        Code sent to <span className="score text-chalk">+91 {phone}</span>{" "}
        <button type="button" onClick={() => setStep("phone")} className="text-lime underline-offset-2 hover:underline">
          change
        </button>
      </p>
      {devCode && (
        <p className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          Demo mode: your code is <span className="score font-bold tracking-widest">{devCode}</span>
        </p>
      )}
      <div>
        <label className="label" htmlFor="otp">6-digit code</label>
        <input
          id="otp"
          className="input score text-center text-2xl tracking-[0.5em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
      </div>
      <div>
        <label className="label" htmlFor="name">Your name (first time only)</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
      </div>
      <ErrorNote error={error} />
      <button className="btn-lime w-full" disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : cta}
      </button>
      <button type="button" onClick={() => send()} className="w-full text-center text-sm text-chalk-mute hover:text-chalk" disabled={busy}>
        Resend code
      </button>
    </form>
  );
}
