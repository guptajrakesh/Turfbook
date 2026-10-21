from .models import Booking, Court, Location
from .slots import Slot
from .timeutil import iso_utc, utc_to_local


def slot_out(s: Slot) -> dict:
    return {
        "starts_at": iso_utc(s.starts_at),
        "ends_at": iso_utc(s.ends_at),
        "start": s.local_start.strftime("%H:%M"),
        "end": s.local_end.strftime("%H:%M"),
        "price": s.price,
        "status": s.status,
        "label": s.label,
    }


def court_out(c: Court) -> dict:
    return {
        "id": c.id,
        "location_id": c.location_id,
        "name": c.name,
        "sports": c.sports,
        "surface": c.surface,
        "base_price": c.base_price,
        "is_active": c.is_active,
    }


def location_out(loc: Location, *, courts: bool = False) -> dict:
    out = {
        "id": loc.id,
        "slug": loc.slug,
        "name": loc.name,
        "address": loc.address,
        "area": loc.area,
        "city": loc.city,
        "lat": loc.lat,
        "lng": loc.lng,
        "timezone": loc.timezone,
        "open_time": loc.open_time.strftime("%H:%M"),
        "close_time": loc.close_time.strftime("%H:%M"),
        "amenities": loc.amenities,
        "photo_url": loc.photo_url,
        "description": loc.description,
        "advance_percent": loc.advance_percent,
        "is_active": loc.is_active,
        "sports": sorted({s for c in loc.courts if c.is_active for s in c.sports}),
    }
    if courts:
        out["courts"] = [court_out(c) for c in loc.courts if c.is_active]
    return out


def booking_out(b: Booking, *, with_code: bool = False) -> dict:
    tz = b.location.timezone
    start, end = utc_to_local(b.starts_at, tz), utc_to_local(b.ends_at, tz)
    out = {
        "id": b.id,
        "group_id": b.group_id,
        "status": b.status,
        "source": b.source,
        "sport": b.sport,
        "date": start.date().isoformat(),
        "start": start.strftime("%H:%M"),
        "end": end.strftime("%H:%M"),
        "starts_at": iso_utc(b.starts_at),
        "ends_at": iso_utc(b.ends_at),
        "amount": b.amount,
        "paid_amount": b.paid_amount,
        "refunded_amount": b.refunded_amount,
        "hold_expires_at": iso_utc(b.hold_expires_at),
        "checked_in": b.checked_in_at is not None,
        "customer_name": b.customer_name,
        "customer_phone": b.customer_phone,
        "court": {"id": b.court.id, "name": b.court.name},
        "venue": {"id": b.location.id, "slug": b.location.slug, "name": b.location.name,
                  "area": b.location.area, "city": b.location.city},
    }
    if with_code and b.status == "confirmed":  # a held slot is not a ticket yet
        out["checkin_code"] = b.checkin_code
    return out
