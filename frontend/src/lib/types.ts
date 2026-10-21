export type SlotStatus = "free" | "booked" | "held" | "blocked" | "past" | "too_far";

export type Slot = {
  starts_at: string;
  ends_at: string;
  start: string;
  end: string;
  price: number;
  status: SlotStatus;
  label: string;
};

export type Court = {
  id: string;
  location_id: string;
  name: string;
  sports: string[];
  surface: string;
  base_price: number;
  is_active: boolean;
};

export type Venue = {
  id: string;
  slug: string;
  name: string;
  address: string;
  area: string;
  city: string;
  lat: number;
  lng: number;
  timezone: string;
  open_time: string;
  close_time: string;
  amenities: string[];
  photo_url: string | null;
  description: string;
  advance_percent: number;
  is_active: boolean;
  sports: string[];
  courts?: Court[];
  business?: string;
  distance_km?: number | null;
  courts_count?: number;
  price_from?: number | null;
  next_slot?: Slot | null;
};

export type Booking = {
  id: string;
  group_id: string;
  status: "held" | "confirmed" | "cancelled" | "completed" | "no_show";
  source: "online" | "walk_in" | "phone";
  sport: string;
  date: string;
  start: string;
  end: string;
  starts_at: string;
  ends_at: string;
  amount: number;
  paid_amount: number;
  refunded_amount: number;
  hold_expires_at: string | null;
  checked_in: boolean;
  customer_name: string;
  customer_phone: string;
  checkin_code?: string;
  court: { id: string; name: string };
  venue: { id: string; slug: string; name: string; area: string; city: string };
};

export type BookingGroup = {
  group_id: string;
  status: Booking["status"];
  total: number;
  advance_amount: number | null;
  hold_expires_at: string | null;
  bookings: Booking[];
  result?: string;
};
