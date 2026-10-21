import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorNote } from "../../components/ui";
import { api, applySession, type Session } from "../../lib/api";

export default function Onboarding() {
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const create = useMutation({
    mutationFn: () => api<Session>("/owner/onboard", { method: "POST", json: { business_name: name, gstin: gstin || undefined } }),
    onSuccess: applySession,
  });
  return (
    <div className="mx-auto max-w-lg">
      <p className="eyebrow">Step 1 of 3 · Under 30 minutes to go live</p>
      <h1 className="display mt-2 text-6xl">Register your club</h1>
      <p className="mt-2 text-chalk-dim">Next you'll add your first location and courts, then share your booking link.</p>
      <form
        className="card mt-6 space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <label className="label" htmlFor="biz">Business name</label>
          <input id="biz" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kickoff Arenas" required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="gst">GSTIN (optional)</label>
          <input id="gst" className="input score uppercase" value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="27AAPFU0939F1ZV" />
        </div>
        <ErrorNote error={create.error} />
        <button className="btn-lime w-full" disabled={create.isPending || name.length < 2}>
          {create.isPending ? "Creating…" : "Create my venue account"}
        </button>
      </form>
    </div>
  );
}
