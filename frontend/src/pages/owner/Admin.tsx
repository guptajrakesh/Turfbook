import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorNote, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { rupees } from "../../lib/format";

type TenantRow = { id: string; name: string; status: string; kyc_status: string; gstin: string | null; plan: string | null; locations: number; bookings: number; fees_due: number };
type Plan = { id: string; name: string; fixed_fee: number; per_booking_fee: number; billing_period: string };

/** Platform admin: tenant onboarding status, KYC and plans. */
export default function Admin() {
  const qc = useQueryClient();
  const tenants = useQuery({ queryKey: ["admin-tenants"], queryFn: () => api<TenantRow[]>("/admin/tenants") });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => api<Plan[]>("/admin/plans") });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) => api(`/admin/tenants/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tenants"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">League office</p>
        <h1 className="display text-6xl">Platform admin</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {plans.data?.map((p) => (
          <div key={p.id} className="card p-4">
            <p className="display text-2xl">{p.name}</p>
            <p className="score text-sm text-chalk-dim">{rupees(p.fixed_fee)}/{p.billing_period} + {rupees(p.per_booking_fee)}/online booking</p>
          </div>
        ))}
      </div>
      <ErrorNote error={patch.error} />
      {tenants.isLoading ? <Spinner /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-chalk-mute">
              <tr><th className="p-3">Business</th><th>Plan</th><th className="text-right">Locations</th><th className="text-right">Bookings</th><th className="text-right">Fees accrued</th><th className="p-3">KYC</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tenants.data?.map((t) => (
                <tr key={t.id}>
                  <td className="p-3 font-semibold">{t.name}<span className="block text-xs font-normal text-chalk-mute">{t.gstin ?? "No GSTIN"}</span></td>
                  <td>{t.plan ?? "—"}</td>
                  <td className="score text-right">{t.locations}</td>
                  <td className="score text-right">{t.bookings}</td>
                  <td className="score text-right">{rupees(t.fees_due)}</td>
                  <td className="p-3">
                    <button className={`chip ${t.kyc_status === "approved" ? "chip-on" : ""}`} onClick={() => patch.mutate({ id: t.id, body: { kyc_status: t.kyc_status === "approved" ? "pending" : "approved" } })}>
                      {t.kyc_status}
                    </button>
                  </td>
                  <td className="p-3">
                    <button className={`chip ${t.status === "suspended" ? "border-flag text-flag" : ""}`} onClick={() => patch.mutate({ id: t.id, body: { status: t.status === "active" ? "suspended" : "active" } })}>
                      {t.status}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
