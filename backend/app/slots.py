"""Slot engine. Slots are computed on read, never stored: slot rules + opening
hours give the candidate grid, then blocks and active bookings are subtracted
and each free slot is priced by the highest-priority matching pricing rule."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import Block, Booking, Court, PricingRule, SlotRule
from .timeutil import local_to_utc, local_today, utc_to_local, utcnow

OCCUPYING = ("held", "confirmed", "completed", "no_show")


@dataclass
class Slot:
    starts_at: datetime  # naive UTC
    ends_at: datetime
    local_start: datetime
    local_end: datetime
    price: int
    status: str  # free, booked, held, blocked, past, too_far
    label: str = ""  # pricing rule label, e.g. "Peak"


def _minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def opening_window(court: Court, day: date) -> tuple[datetime, datetime]:
    """UTC bounds of the location's opening hours on a local date. A close time
    at or before the open time runs past midnight (00:00 = midnight)."""
    loc = court.location
    start = local_to_utc(day, loc.open_time, loc.timezone)
    close_day = day if _minutes(loc.close_time) > _minutes(loc.open_time) else day + timedelta(days=1)
    end = local_to_utc(close_day, loc.close_time, loc.timezone)
    return start, end


def price_for(rules: list[PricingRule], base_price: int, local_start: datetime) -> tuple[int, str]:
    weekday = local_start.weekday()
    minute = local_start.hour * 60 + local_start.minute
    best: tuple[int, int, PricingRule] | None = None
    for r in rules:
        if r.day_of_week is not None and r.day_of_week != weekday:
            continue
        lo, hi = _minutes(r.start_time), _minutes(r.end_time) or 24 * 60
        if not lo <= minute < hi:
            continue
        key = (r.priority, 1 if r.day_of_week is not None else 0)
        if best is None or key > best[:2]:
            best = (*key, r)
    return (best[2].price, best[2].label) if best else (base_price, "")


def rule_for(court: Court) -> SlotRule:
    return court.slot_rule or SlotRule(court_id=court.id, slot_minutes=60, buffer_minutes=0,
                                       max_advance_days=14, min_notice_minutes=30)


def court_slots(db: Session, court: Court, day: date, now: datetime | None = None) -> list[Slot]:
    now = now or utcnow()
    rule = rule_for(court)
    tz = court.location.timezone
    open_at, close_at = opening_window(court, day)
    step = timedelta(minutes=rule.slot_minutes + rule.buffer_minutes)
    length = timedelta(minutes=rule.slot_minutes)

    bookings = db.scalars(
        select(Booking).where(
            Booking.court_id == court.id,
            Booking.status.in_(OCCUPYING),
            Booking.starts_at < close_at,
            Booking.ends_at > open_at,
            or_(Booking.status != "held", Booking.hold_expires_at > now),
        )
    ).all()
    blocks = db.scalars(
        select(Block).where(Block.court_id == court.id, Block.starts_at < close_at, Block.ends_at > open_at)
    ).all()
    rules = db.scalars(select(PricingRule).where(PricingRule.court_id == court.id)).all()

    earliest = now + timedelta(minutes=rule.min_notice_minutes)
    last_day = local_today(tz) + timedelta(days=rule.max_advance_days)

    slots: list[Slot] = []
    start = open_at
    while start + length <= close_at:
        end = start + length
        local_start = utc_to_local(start, tz)
        price, label = price_for(rules, court.base_price, local_start)
        status = "free"
        if any(b.starts_at < end and b.ends_at > start for b in blocks):
            status = "blocked"
        else:
            hit = next((b for b in bookings if b.starts_at < end and b.ends_at > start), None)
            if hit:
                status = "held" if hit.status == "held" else "booked"
        if status == "free" and start < earliest:
            status = "past"
        if status == "free" and day > last_day:
            status = "too_far"
        slots.append(Slot(start, end, local_start, utc_to_local(end, tz), price, status, label))
        start += step
    return slots


def next_free_slot(db: Session, courts: list[Court], day: date, sport: str | None = None) -> Slot | None:
    best: Slot | None = None
    for court in courts:
        if not court.is_active or (sport and sport not in court.sports):
            continue
        for s in court_slots(db, court, day):
            if s.status == "free":
                if best is None or s.starts_at < best.starts_at:
                    best = s
                break
    return best
