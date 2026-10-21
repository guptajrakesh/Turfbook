import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import LoginForm from "../components/LoginForm";
import { PitchLines } from "../components/sport";
import { useSession } from "../lib/session";

export default function Login() {
  const { session } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") || "/";
  if (session) return <Navigate to={next} replace />;
  return (
    <div className="mx-auto grid max-w-4xl gap-6 pt-8 md:grid-cols-2">
      <div className="turf-night relative hidden overflow-hidden rounded-3xl border border-white/10 p-8 md:block">
        <PitchLines className="absolute inset-0 h-full w-full text-white/10" />
        <div className="relative">
          <p className="eyebrow">Team sheet</p>
          <h1 className="display mt-3 text-6xl">
            Sign in.
            <br />
            <span className="text-lime">Suit up.</span>
          </h1>
          <ul className="mt-6 space-y-2 text-sm text-chalk-dim">
            <li>· One login for every venue on TurfTime</li>
            <li>· Your tickets and check-in codes in one place</li>
            <li>· Cancel in a tap, refunds go straight back</li>
          </ul>
        </div>
      </div>
      <div className="card p-6">
        <h2 className="display mb-1 text-4xl">Log in</h2>
        <p className="mb-6 text-sm text-chalk-dim">We'll text you a one-time code. No passwords.</p>
        <LoginForm onDone={() => navigate(next, { replace: true })} />
      </div>
    </div>
  );
}
