import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import MatchTicket from "../components/MatchTicket";
import { ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { BookingGroup } from "../lib/types";

export default function Ticket() {
  const { groupId } = useParams();
  const group = useQuery({ queryKey: ["group", groupId], queryFn: () => api<BookingGroup>(`/bookings/groups/${groupId}`) });
  if (group.isLoading) return <Spinner />;
  if (group.error || !group.data) return <div className="pt-8"><ErrorNote error={group.error} /></div>;
  const confirmed = group.data.status === "confirmed";
  return (
    <div className="mx-auto max-w-md space-y-6 pt-8">
      <div className="text-center">
        <p className="eyebrow">{confirmed ? "Booking confirmed" : group.data.status}</p>
        <h1 className="display mt-2 text-6xl">{confirmed ? "You're on the team sheet" : "Booking update"}</h1>
        {confirmed && <p className="mt-2 text-sm text-chalk-dim">Confirmation sent on WhatsApp. See you on the pitch.</p>}
      </div>
      <MatchTicket bookings={group.data.bookings} />
      <div className="grid grid-cols-2 gap-2">
        <Link to="/games" className="btn-ghost">My games</Link>
        <Link to="/" className="btn-lime">Book another</Link>
      </div>
    </div>
  );
}
