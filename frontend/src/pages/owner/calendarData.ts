import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Booking, Court, Slot, Venue } from "../../lib/types";

export type CalendarCourt = Court & {
  slots: Slot[];
  bookings: Booking[];
  blocks: { id: string; starts_at: string; ends_at: string; reason: string }[];
};
export type CalendarData = { location: Venue; date: string; courts: CalendarCourt[] };

export function useCalendar(locationId: string, date: string, refetchInterval = 30_000) {
  return useQuery({
    queryKey: ["calendar", locationId, date],
    queryFn: () => api<CalendarData>(`/owner/calendar?location=${locationId}&date=${date}`),
    enabled: !!locationId,
    refetchInterval,
  });
}

export function bookingAt(court: CalendarCourt, slot: Slot) {
  return court.bookings.find((b) => b.starts_at < slot.ends_at && b.ends_at > slot.starts_at);
}

export function blockAt(court: CalendarCourt, slot: Slot) {
  return court.blocks.find((b) => b.starts_at < slot.ends_at && b.ends_at > slot.starts_at);
}
