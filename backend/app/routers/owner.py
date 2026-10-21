import re
import secrets
from collections import defaultdict
from datetime import date, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..booking_service import DEFAULT_POLICY, cancel_booking, insert_bookings, policy_for
from ..db import get_db
from ..deps import TenantCtx, current_user, require_role
from ..models import (
    AuditLog,
    Block,
    Booking,
    CancellationPolicy,
    Court,
    Location,
    Membership,
    Plan,
    PlatformFeeLedger,
    PricingRule,
    SlotRule,
    Tenant,
    User,
)
from ..schemas import (
    BlockIn,
    CheckIn,
    CourtIn,
    LocationIn,
    MemberIn,
    Onboard,
    PolicyTier,
    PricingRuleIn,
    SlotRuleIn,
    WalkIn,
)
from ..serializers import booking_out, court_out, location_out, slot_out
from ..slots import court_slots, rule_for
from ..timeutil import iso_utc, local_to_utc, local_today, to_naive_utc, utc_to_local, utcnow
from .auth import session_payload

router = APIRouter(prefix="/owner", tags=["owner"])
owner = require_role("owner")
manager = require_role("manager")
staff = require_role("staff")


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:100]


def _court(db: Session, ctx: TenantCtx, court_id: str) -> Court:
    c = db.get(Court, court_id)
    if not c or c.tenant_id != ctx.tenant_id or not ctx.can_access(c.location_id):
        raise HTTPException(404, "Court not found")
    return c


def _audit(db: Session, ctx: TenantCtx, action: str, entity: str, entity_id: str, **detail) -> None:
    db.add(AuditLog(tenant_id=ctx.tenant_id, user_id=ctx.user.id, action=action, entity=entity,
                    entity_id=entity_id, detail=detail))


# --- onboarding ---------------------------------------------------------------

@router.post("/onboard")
def onboard(body: Onboard, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    plan = db.scalar(select(Plan).where(Plan.name == "Hybrid")) or db.scalar(select(Plan))
    tenant = Tenant(name=body.business_name, gstin=body.gstin, plan_id=plan.id if plan else None)
    db.add(tenant)
    db.flush()
    db.add(Membership(user_id=user.id, tenant_id=tenant.id, role="owner", location_ids=[]))
    db.add_all(CancellationPolicy(tenant_id=tenant.id, hours_before=h, refund_percent=p) for h, p in DEFAULT_POLICY)
    db.commit()
    return session_payload(db, user, response, tenant.id)


@router.get("/tenant")
def tenant_info(ctx: TenantCtx = Depends(staff), db: Session = Depends(get_db)):
    t = db.get(Tenant, ctx.tenant_id)
    return {"id": t.id, "name": t.name, "gstin": t.gstin, "kyc_status": t.kyc_status, "status": t.status,
            "role": ctx.role, "plan": {"name": t.plan.name, "fixed_fee": t.plan.fixed_fee,
                                       "per_booking_fee": t.plan.per_booking_fee,
                                       "billing_period": t.plan.billing_period} if t.plan else None}


# --- locations & courts -------------------------------------------------------

@router.get("/locations")
def list_locations(ctx: TenantCtx = Depends(staff), db: Session = Depends(get_db)):
    rows = db.scalars(select(Location).where(Location.tenant_id == ctx.tenant_id).order_by(Location.name)).all()
    return [location_out(loc, courts=True) | {"courts": [court_out(c) for c in loc.courts]}
            for loc in rows if ctx.can_access(loc.id)]


@router.post("/locations", status_code=201)
def create_location(body: LocationIn, ctx: TenantCtx = Depends(owner), db: Session = Depends(get_db)):
    slug = _slugify(f"{body.name} {body.area} {body.city}")
    if db.scalar(select(Location.id).where(Location.slug == slug)):
        slug = f"{slug}-{secrets.token_hex(2)}"
    loc = Location(tenant_id=ctx.tenant_id, slug=slug, **body.model_dump())
    db.add(loc)
    db.commit()
    return location_out(loc, courts=True)


@router.put("/locations/{location_id}")
def update_location(location_id: str, body: LocationIn, ctx: TenantCtx = Depends(manager),
                    db: Session = Depends(get_db)):
    loc = ctx.check_location(db.get(Location, location_id))
    for k, v in body.model_dump().items():
        setattr(loc, k, v)
    db.commit()
    return location_out(loc, courts=True)


@router.post("/courts", status_code=201)
def create_court(body: CourtIn, ctx: TenantCtx = Depends(manager), db: Session = Depends(get_db)):
    ctx.check_location(db.get(Location, body.location_id))
    c = Court(tenant_id=ctx.tenant_id, **body.model_dump())
    c.slot_rule = SlotRule()
    db.add(c)
    db.commit()
    return court_out(c)


@router.put("/courts/{court_id}")
def update_court(court_id: str, body: CourtIn, ctx: TenantCtx = Depends(manager), db: Session = Depends(get_db)):
    c = _court(db, ctx, court_id)
    ctx.check_location(db.get(Location, body.location_id))
    if body.base_price != c.base_price:
        _audit(db, ctx, "price_change", "court", c.id, old=c.base_price, new=body.base_price)
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return court_out(c)


@router.get("/courts/{court_id}/rules")
def court_rules(court_id: str, ctx: TenantCtx = Depends(staff), db: Session = Depends(get_db)):
    c = _court(db, ctx, court_id)
    r = rule_for(c)
    return {
        "slot_rule": {"slot_minutes": r.slot_minutes, "buffer_minutes": r.buffer_minutes,
                      "max_advance_days": r.max_advance_days, "min_notice_minutes": r.min_notice_minutes},
        "pricing_rules": [_pricing_out(p) for p in sorted(c.pricing_rules, key=lambda p: (-p.priority, p.start_time))],
    }


@router.put("/courts/{court_id}/slot-rule")
def put_slot_rule(court_id: str, body: SlotRuleIn, ctx: TenantCtx = Depends(manager), db: Session = Depends(get_db)):
    c = _court(db, ctx, court_id)
    if c.slot_rule is None:
        c.slot_rule = SlotRule()
    for k, v in body.model_dump().items():
        setattr(c.slot_rule, k, v)
    db.commit()
    return body


def _pricing_out(p: PricingRule) -> dict:
    return {"id": p.id, "court_id": p.court_id, "label": p.label, "day_of_week": p.day_of_week,
            "start_time": p.start_time.strftime("%H:%M"), "end_time": p.end_time.strftime("%H:%M"),
            "price": p.price, "priority": p.priority}


@router.post("/pricing-rules", status_code=201)
def create_pricing_rule(body: PricingRuleIn, ctx: TenantCtx = Depends(manager), db: Session = Depends(get_db)):
    _court(db, ctx, body.court_id)
    p = PricingRule(tenant_id=ctx.tenant_id, **body.model_dump())
    db.add(p)
    db.flush()
    _audit(db, ctx, "price_change", "pricing_rule", p.id, created=_pricing_out(p))
    db.commit()
    return _pricing_out(p)


@router.delete("/pricing-rules/{rule_id}")
def delete_pricing_rule(rule_id: str, ctx: TenantCtx = Depends(manager), db: Session = Depends(get_db)):
    p = db.get(PricingRule, rule_id)
    if not p or p.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Rule not found")
    _court(db, ctx, p.court_id)
    _audit(db, ctx, "price_change", "pricing_rule", p.id, deleted=_pricing_out(p))
    db.delete(p)
    db.commit()
    return {"deleted": True}


# --- blocks -------------------------------------------------------------------

@router.post("/blocks", status_code=201)
def create_block(body: BlockIn, ctx: TenantCtx = Depends(manager), db: Session = Depends(get_db)):
    c = _court(db, ctx, body.court_id)
    starts, ends = to_naive_utc(body.starts_at), to_naive_utc(body.ends_at)
    if ends <= starts:
        raise HTTPException(422, "Block must end after it starts")
    clash = db.scalar(select(Booking.id).where(
        Booking.court_id == c.id, Booking.status == "confirmed", Booking.starts_at < ends, Booking.ends_at > starts))
    if clash:
        raise HTTPException(409, "A confirmed booking falls in that window; cancel or move it first")
    b = Block(tenant_id=ctx.tenant_id, court_id=c.id, starts_at=starts, ends_at=ends, reason=body.reason)
    db.add(b)
    db.commit()
    return {"id": b.id, "court_id": c.id, "starts_at": iso_utc(starts), "ends_at": iso_utc(ends), "reason": b.reason}


@router.delete("/blocks/{block_id}")
def delete_block(block_id: str, ctx: TenantCtx = Depends(manager), db: Session = Depends(get_db)):
    b = db.get(Block, block_id)
    if not b or b.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Block not found")
    _court(db, ctx, b.court_id)
    db.delete(b)
    db.commit()
    return {"deleted": True}


# --- operations -------------------------------------------------------------------

@router.get("/calendar")
def calendar(location: str, on: date | None = Query(None, alias="date"), ctx: TenantCtx = Depends(staff),
             db: Session = Depends(get_db)):
    loc = ctx.check_location(db.get(Location, location))
    day = on or local_today(loc.timezone)
    courts = []
    for c in loc.courts:
        if not c.is_active:
            continue
        slots = court_slots(db, c, day)
        lo, hi = (slots[0].starts_at, slots[-1].ends_at) if slots else (None, None)
        bookings = db.scalars(select(Booking).where(
            Booking.court_id == c.id, Booking.status.in_(("held", "confirmed", "completed", "no_show")),
            Booking.starts_at < hi, Booking.ends_at > lo)).all() if slots else []
        blocks = db.scalars(select(Block).where(Block.court_id == c.id, Block.starts_at < hi,
                                                Block.ends_at > lo)).all() if slots else []
        courts.append({
            **court_out(c),
            "slots": [slot_out(s) for s in slots],
            "bookings": [booking_out(b, with_code=False) for b in bookings],
            "blocks": [{"id": x.id, "starts_at": iso_utc(x.starts_at), "ends_at": iso_utc(x.ends_at),
                        "reason": x.reason} for x in blocks],
        })
    return {"location": location_out(loc), "date": day.isoformat(), "courts": courts}


@router.post("/bookings/walk-in", status_code=201)
def walk_in(body: WalkIn, ctx: TenantCtx = Depends(staff), db: Session = Depends(get_db)):
    c = _court(db, ctx, body.court_id)
    bookings = insert_bookings(
        db, c, [to_naive_utc(s) for s in body.starts_at], status_="confirmed", source=body.source,
        user_id=None, customer_name=body.customer_name, customer_phone=body.customer_phone, sport=body.sport,
    )
    total = sum(b.amount for b in bookings)
    cash = total if body.paid_amount is None else min(body.paid_amount, total)
    for b in bookings:  # spread the cash collected across slots in order
        b.paid_amount = min(b.amount, cash)
        cash -= b.paid_amount
    db.commit()
    return [booking_out(b, with_code=True) for b in bookings]


@router.get("/bookings")
def list_bookings(location: str, start: date, end: date, ctx: TenantCtx = Depends(staff),
                  db: Session = Depends(get_db)):
    loc = ctx.check_location(db.get(Location, location))
    lo = local_to_utc(start, time(0), loc.timezone)
    hi = lo + timedelta(days=(end - start).days + 1)
    rows = db.scalars(select(Booking).where(Booking.location_id == loc.id, Booking.starts_at >= lo,
                                            Booking.starts_at < hi, Booking.status != "held")
                      .order_by(Booking.starts_at)).all()
    return [booking_out(b) for b in rows]


def _booking(db: Session, ctx: TenantCtx, booking_id: str) -> Booking:
    b = db.get(Booking, booking_id)
    if not b or b.tenant_id != ctx.tenant_id or not ctx.can_access(b.location_id):
        raise HTTPException(404, "Booking not found")
    return b


@router.post("/bookings/{booking_id}/check-in")
def check_in(booking_id: str, body: CheckIn, ctx: TenantCtx = Depends(staff), db: Session = Depends(get_db)):
    b = _booking(db, ctx, booking_id)
    if b.status != "confirmed":
        raise HTTPException(409, f"Booking is {b.status}")
    if not secrets.compare_digest(b.checkin_code, body.code):
        raise HTTPException(400, "Wrong check-in code")
    b.checked_in_at = utcnow()
    db.commit()
    return booking_out(b)


@router.post("/check-in")
def check_in_by_code(body: CheckIn, location: str, ctx: TenantCtx = Depends(staff), db: Session = Depends(get_db)):
    """Front desk scans the player's QR (or types the 6-digit code) without
    looking the booking up first. Matches today's confirmed bookings only."""
    loc = ctx.check_location(db.get(Location, location))
    now = utcnow()
    b = db.scalar(select(Booking).where(
        Booking.location_id == loc.id, Booking.checkin_code == body.code, Booking.status == "confirmed",
        Booking.ends_at > now, Booking.starts_at < now + timedelta(hours=12)).order_by(Booking.starts_at))
    if not b:
        raise HTTPException(404, "No booking for that code today")
    b.checked_in_at = b.checked_in_at or now
    db.commit()
    return booking_out(b)


@router.post("/bookings/{booking_id}/cancel")
def staff_cancel(booking_id: str, full_refund: bool = False, ctx: TenantCtx = Depends(manager),
                 db: Session = Depends(get_db)):
    b = _booking(db, ctx, booking_id)
    refund = cancel_booking(db, b, by=ctx.role, actor_id=ctx.user.id, full_refund=full_refund)
    db.commit()
    return {"status": b.status, "refund": refund}


@router.post("/bookings/{booking_id}/no-show")
def no_show(booking_id: str, ctx: TenantCtx = Depends(staff), db: Session = Depends(get_db)):
    b = _booking(db, ctx, booking_id)
    if b.status != "confirmed" or b.starts_at > utcnow():
        raise HTTPException(409, "Only a started, confirmed booking can be marked no-show")
    b.status = "no_show"
    db.commit()
    return booking_out(b)


# --- policy, staff, reports ---------------------------------------------------

@router.get("/cancellation-policy")
def get_policy(ctx: TenantCtx = Depends(staff), db: Session = Depends(get_db)):
    return [{"hours_before": h, "refund_percent": p} for h, p in policy_for(db, ctx.tenant_id)]


@router.put("/cancellation-policy")
def put_policy(tiers: list[PolicyTier], ctx: TenantCtx = Depends(owner), db: Session = Depends(get_db)):
    db.execute(delete(CancellationPolicy).where(CancellationPolicy.tenant_id == ctx.tenant_id))
    db.add_all(CancellationPolicy(tenant_id=ctx.tenant_id, **t.model_dump()) for t in tiers)
    db.commit()
    return get_policy(ctx, db)


@router.get("/members")
def list_members(ctx: TenantCtx = Depends(owner), db: Session = Depends(get_db)):
    rows = db.scalars(select(Membership).where(Membership.tenant_id == ctx.tenant_id)).all()
    return [{"id": m.id, "user_id": m.user_id, "phone": m.user.phone, "name": m.user.name, "role": m.role,
             "location_ids": m.location_ids} for m in rows]


@router.post("/members", status_code=201)
def add_member(body: MemberIn, ctx: TenantCtx = Depends(owner), db: Session = Depends(get_db)):
    for lid in body.location_ids:
        ctx.check_location(db.get(Location, lid))
    user = db.scalar(select(User).where(User.phone == body.phone))
    if not user:
        user = User(phone=body.phone, name=body.name)
        db.add(user)
        db.flush()
    m = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.tenant_id == ctx.tenant_id))
    if m:
        m.role, m.location_ids = body.role, body.location_ids
    else:
        m = Membership(user_id=user.id, tenant_id=ctx.tenant_id, role=body.role, location_ids=body.location_ids)
        db.add(m)
    db.commit()
    return {"id": m.id, "phone": user.phone, "name": user.name, "role": m.role, "location_ids": m.location_ids}


@router.delete("/members/{member_id}")
def remove_member(member_id: str, ctx: TenantCtx = Depends(owner), db: Session = Depends(get_db)):
    m = db.get(Membership, member_id)
    if not m or m.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Member not found")
    if m.user_id == ctx.user.id:
        raise HTTPException(409, "You cannot remove yourself")
    db.delete(m)
    db.commit()
    return {"deleted": True}


def _report_locations(db: Session, ctx: TenantCtx, location: str | None) -> list[Location]:
    locs = db.scalars(select(Location).where(Location.tenant_id == ctx.tenant_id)).all()
    return [loc for loc in locs if ctx.can_access(loc.id) and (not location or loc.id == location)]


@router.get("/reports/revenue")
def revenue(start: date, end: date, location: str | None = None, ctx: TenantCtx = Depends(owner),
            db: Session = Depends(get_db)):
    if (end - start).days > 366 or end < start:
        raise HTTPException(422, "Pick a range of up to a year")
    by_day: dict[str, dict] = defaultdict(lambda: {"online": 0, "walk_in": 0, "bookings": 0})
    by_court: dict[str, dict] = {}
    totals = {"gross": 0, "refunds": 0, "online": 0, "walk_in": 0, "bookings": 0, "platform_fees": 0}
    for loc in _report_locations(db, ctx, location):
        rows = db.scalars(select(Booking).where(Booking.location_id == loc.id,
                                                Booking.status.in_(("confirmed", "completed", "no_show", "cancelled")),
                                                Booking.paid_amount > 0)).all()
        for b in rows:
            d = utc_to_local(b.starts_at, loc.timezone).date()
            if not start <= d <= end:
                continue
            net = b.paid_amount - b.refunded_amount
            channel = "online" if b.source == "online" else "walk_in"
            totals["gross"] += b.paid_amount
            totals["refunds"] += b.refunded_amount
            totals[channel] += net
            day = by_day[d.isoformat()]
            day[channel] += net
            if b.status != "cancelled":
                totals["bookings"] += 1
                day["bookings"] += 1
            court = by_court.setdefault(b.court_id, {"court": b.court.name, "location": loc.name, "revenue": 0,
                                                     "bookings": 0})
            court["revenue"] += net
            court["bookings"] += b.status != "cancelled"
    fees = db.scalars(select(PlatformFeeLedger).where(PlatformFeeLedger.tenant_id == ctx.tenant_id,
                                                      PlatformFeeLedger.reversed.is_(False))).all()
    totals["platform_fees"] = sum(f.amount for f in fees if start <= f.created_at.date() <= end)
    totals["net"] = totals["gross"] - totals["refunds"]
    days = [{"date": (start + timedelta(days=i)).isoformat(), **by_day[(start + timedelta(days=i)).isoformat()]}
            for i in range((end - start).days + 1)]
    return {"totals": totals, "days": days,
            "courts": sorted(by_court.values(), key=lambda c: -c["revenue"])}


@router.get("/reports/occupancy")
def occupancy(start: date, end: date, location: str | None = None, ctx: TenantCtx = Depends(owner),
              db: Session = Depends(get_db)):
    if (end - start).days > 92 or end < start:
        raise HTTPException(422, "Pick a range of up to 3 months")
    out = []
    for loc in _report_locations(db, ctx, location):
        for c in loc.courts:
            if not c.is_active:
                continue
            total = booked = 0
            for i in range((end - start).days + 1):
                for s in court_slots(db, c, start + timedelta(days=i)):
                    if s.status == "blocked":
                        continue
                    total += 1
                    booked += s.status in ("booked", "held")
            out.append({"court": c.name, "location": loc.name, "slots": total, "booked": booked,
                        "occupancy": round(100 * booked / total, 1) if total else 0})
    return out
