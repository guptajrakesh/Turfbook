"""Every channel (player app, walk-in, phone) creates bookings through
`insert_bookings`, so the owner calendar and the player app never disagree."""

import secrets
from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .models import (
    AuditLog,
    Block,
    Booking,
    CancellationPolicy,
    Court,
    Notification,
    Payment,
    PlatformFeeLedger,
    Tenant,
    new_id,
)
from .slots import court_slots
from .timeutil import utc_to_local, utcnow

DEFAULT_POLICY = [(24, 100), (6, 50), (0, 0)]


def expire_holds(db: Session, court_id: str | None = None) -> int:
    """Cancel held bookings whose payment window ran out (run every minute by the
    worker, and before each new hold so stale holds never block the constraint)."""
    q = update(Booking).where(Booking.status == "held", Booking.hold_expires_at <= utcnow())
    if court_id:
        q = q.where(Booking.court_id == court_id)
    n = db.execute(q.values(status="cancelled", cancelled_by="system")).rowcount
    db.flush()
    return n


def _conflict() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "That slot was just taken. Please pick another one.")


def insert_bookings(
    db: Session,
    court: Court,
    starts: list[datetime],
    *,
    status_: str,
    source: str,
    user_id: str | None,
    customer_name: str,
    customer_phone: str,
    sport: str,
    validate_grid: bool = True,
) -> list[Booking]:
    if not starts:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick at least one slot")
    if not court.is_active or not court.location.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Court is not taking bookings")
    if sport and court.sports and sport not in court.sports:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{court.name} does not host {sport}")
    expire_holds(db, court.id)

    tz = court.location.timezone
    by_day: dict[date, dict[datetime, object]] = {}
    group_id = new_id()
    created: list[Booking] = []
    hold_until = utcnow() + timedelta(minutes=get_settings().hold_minutes) if status_ == "held" else None
    for start in sorted(set(starts)):
        day = utc_to_local(start, tz).date()
        grid = by_day.setdefault(day, {s.starts_at: s for s in court_slots(db, court, day)})
        # the opening window can start the previous local day for late-night slots
        slot = grid.get(start) or {s.starts_at: s for s in court_slots(db, court, day - timedelta(days=1))}.get(start)
        if slot is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Not a valid slot for this court")
        allowed = {"free"} if validate_grid else {"free", "past", "too_far"}
        if slot.status not in allowed:
            if slot.status in ("booked", "held", "blocked"):
                raise _conflict()
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That slot can no longer be booked")
        created.append(
            Booking(
                tenant_id=court.tenant_id,
                location_id=court.location_id,
                court_id=court.id,
                user_id=user_id,
                group_id=group_id,
                customer_name=customer_name,
                customer_phone=customer_phone,
                sport=sport or (court.sports[0] if court.sports else ""),
                starts_at=slot.starts_at,
                ends_at=slot.ends_at,
                status=status_,
                source=source,
                amount=slot.price,
                hold_expires_at=hold_until,
                checkin_code=f"{secrets.randbelow(1_000_000):06d}",
            )
        )
    try:
        with db.begin_nested():
            db.add_all(created)
            db.flush()
    except IntegrityError:  # Postgres exclusion constraint: someone won the race
        raise _conflict() from None
    return created


def group_bookings(db: Session, group_id: str) -> list[Booking]:
    return list(db.scalars(select(Booking).where(Booking.group_id == group_id).order_by(Booking.starts_at)))


def amount_due(bookings: list[Booking], pay_mode: str) -> int:
    total = sum(b.amount for b in bookings)
    if pay_mode == "advance":
        pct = bookings[0].location.advance_percent
        return max(1, round(total * pct / 100))
    return total


def _queue(db: Session, b: Booking, template: str, **payload) -> None:
    local = utc_to_local(b.starts_at, b.location.timezone)
    data = {
        "venue": b.location.name,
        "court": b.court.name,
        "when": local.strftime("%a %d %b, %I:%M %p"),
        "code": b.checkin_code,
        **payload,
    }
    db.add(Notification(user_id=b.user_id, phone=b.customer_phone, channel="whatsapp", template=template, payload=data))


def _write_fee(db: Session, b: Booking) -> None:
    tenant = db.get(Tenant, b.tenant_id)
    fee = tenant.plan.per_booking_fee if tenant and tenant.plan else 0
    if fee and b.source == "online":
        db.add(PlatformFeeLedger(tenant_id=b.tenant_id, booking_id=b.id, amount=fee))


def apply_captured_payment(db: Session, payment: Payment, gateway_ref: str, amount: int) -> str:
    """Webhook handler body. Idempotent on gateway_ref. A payment that lands after
    its hold expired is re-confirmed if the slot is still free, else refunded."""
    if payment.gateway_ref == gateway_ref and payment.status != "created":
        return "duplicate"
    payment.gateway_ref = gateway_ref
    payment.status = "captured"
    bookings = group_bookings(db, payment.group_id)
    total = sum(b.amount for b in bookings)
    now = utcnow()

    lapsed = any(b.status != "held" or (b.hold_expires_at and b.hold_expires_at <= now) for b in bookings)
    if lapsed:
        expire_holds(db, bookings[0].court_id)
        if not _still_free(db, bookings):
            return _refund_whole(db, payment, bookings, amount)
    remaining = amount
    for b in bookings:
        share = min(b.amount, round(amount * b.amount / total)) if total else 0
        b.paid_amount = share if b is not bookings[-1] else remaining
        remaining -= b.paid_amount
        b.status = "confirmed"
        b.hold_expires_at = None
        b.cancelled_by = None
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError:  # a re-confirmed late payment lost the slot after all
        return _refund_whole(db, payment, group_bookings(db, payment.group_id), amount)
    for b in bookings:
        _write_fee(db, b)
    _queue(db, bookings[0], "booking_confirmed", slots=len(bookings), paid=amount, total=total)
    db.flush()
    return "confirmed"


def _still_free(db: Session, bookings: list[Booking]) -> bool:
    ids = [b.id for b in bookings]
    for b in bookings:
        clash = db.scalar(
            select(Booking.id).where(
                Booking.court_id == b.court_id, Booking.id.not_in(ids),
                Booking.status.in_(("held", "confirmed")),
                Booking.starts_at < b.ends_at, Booking.ends_at > b.starts_at,
            )
        ) or db.scalar(
            select(Block.id).where(Block.court_id == b.court_id, Block.starts_at < b.ends_at,
                                   Block.ends_at > b.starts_at)
        )
        if clash:
            return False
    return True


def _refund_whole(db: Session, payment: Payment, bookings: list[Booking], amount: int) -> str:
    for b in bookings:
        b.status, b.cancelled_by, b.hold_expires_at = "cancelled", "system", None
    payment.status, payment.refunded_amount = "refunded", amount
    db.flush()
    return "refunded"


def policy_for(db: Session, tenant_id: str) -> list[tuple[int, int]]:
    rows = db.scalars(select(CancellationPolicy).where(CancellationPolicy.tenant_id == tenant_id)).all()
    tiers = [(r.hours_before, r.refund_percent) for r in rows] or DEFAULT_POLICY
    return sorted(tiers, reverse=True)


def refund_percent(tiers: list[tuple[int, int]], hours_before: float) -> int:
    for hours, pct in tiers:
        if hours_before >= hours:
            return pct
    return 0


def cancel_booking(db: Session, b: Booking, *, by: str, actor_id: str | None, full_refund: bool = False) -> int:
    if b.status not in ("held", "confirmed"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Booking is already {b.status}")
    if b.starts_at <= utcnow() and not full_refund:
        raise HTTPException(status.HTTP_409_CONFLICT, "This game has already started")
    hours = (b.starts_at - utcnow()).total_seconds() / 3600
    pct = 100 if full_refund else refund_percent(policy_for(db, b.tenant_id), hours)
    refund = round(b.paid_amount * pct / 100)
    b.status, b.cancelled_by, b.refunded_amount = "cancelled", by, refund

    if refund and b.source == "online":
        payment = db.scalar(select(Payment).where(Payment.group_id == b.group_id, Payment.status != "created"))
        if payment:
            payment.refunded_amount += refund
            payment.status = "refunded" if payment.refunded_amount >= payment.amount else "partially_refunded"
    if pct == 100:  # the platform fee is reversed only on full refunds
        fee = db.scalar(select(PlatformFeeLedger).where(PlatformFeeLedger.booking_id == b.id))
        if fee:
            fee.reversed = True
    if by != "player":
        db.add(AuditLog(tenant_id=b.tenant_id, user_id=actor_id, action="refund" if refund else "cancel",
                        entity="booking", entity_id=b.id, detail={"refund": refund, "percent": pct}))
    _queue(db, b, "booking_cancelled", refund=refund)
    db.flush()
    return refund
