import json
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..booking_service import (
    amount_due,
    apply_captured_payment,
    cancel_booking,
    group_bookings,
    insert_bookings,
    policy_for,
    refund_percent,
)
from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..models import Booking, Court, Payment, User
from ..schemas import HoldRequest, MockPayRequest, PaymentOrderRequest
from ..security import verify_razorpay_signature
from ..serializers import booking_out
from ..timeutil import to_naive_utc, utcnow

router = APIRouter(tags=["bookings"])


def _own_group(db: Session, group_id: str, user: User) -> list[Booking]:
    bookings = group_bookings(db, group_id)
    if not bookings or bookings[0].user_id != user.id:
        raise HTTPException(404, "Booking not found")
    return bookings


@router.post("/bookings/hold", status_code=201)
def hold(body: HoldRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    court = db.get(Court, body.court_id)
    if not court:
        raise HTTPException(404, "Court not found")
    active_holds = db.scalar(
        select(func.count(func.distinct(Booking.group_id))).where(
            Booking.user_id == user.id, Booking.status == "held", Booking.hold_expires_at > utcnow()
        )
    )
    if active_holds >= get_settings().max_active_holds:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Finish or release your other pending bookings first")
    bookings = insert_bookings(
        db, court, [to_naive_utc(s) for s in body.starts_at], status_="held", source="online", user_id=user.id,
        customer_name=user.name or "", customer_phone=user.phone, sport=body.sport,
    )
    db.commit()
    return _group_out(bookings)


def _group_out(bookings: list[Booking], with_code: bool = False) -> dict:
    loc = bookings[0].location
    total = sum(b.amount for b in bookings)
    return {
        "group_id": bookings[0].group_id,
        "status": bookings[0].status,
        "total": total,
        "advance_amount": amount_due(bookings, "advance") if loc.advance_percent < 100 else None,
        "hold_expires_at": booking_out(bookings[0])["hold_expires_at"],
        "bookings": [booking_out(b, with_code=with_code) for b in bookings],
    }


@router.get("/bookings/groups/{group_id}")
def get_group(group_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _group_out(_own_group(db, group_id, user), with_code=True)


@router.post("/bookings/groups/{group_id}/release")
def release(group_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Player backs out of checkout: free held slots immediately."""
    for b in _own_group(db, group_id, user):
        if b.status == "held":
            b.status, b.cancelled_by = "cancelled", "player"
    db.commit()
    return {"released": True}


@router.get("/me/bookings")
def my_bookings(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Booking).where(Booking.user_id == user.id, Booking.status != "held").order_by(Booking.starts_at.desc())
    ).all()
    now = utcnow()
    upcoming = [booking_out(b, with_code=True) for b in reversed(rows) if b.ends_at > now and b.status == "confirmed"]
    past = [booking_out(b) for b in rows if not (b.ends_at > now and b.status == "confirmed")]
    return {"upcoming": upcoming, "past": past}


@router.get("/bookings/{booking_id}/cancel-quote")
def cancel_quote(booking_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.get(Booking, booking_id)
    if not b or b.user_id != user.id:
        raise HTTPException(404, "Booking not found")
    hours = (b.starts_at - utcnow()).total_seconds() / 3600
    tiers = policy_for(db, b.tenant_id)
    pct = refund_percent(tiers, hours)
    return {"refund_percent": pct, "refund": round(b.paid_amount * pct / 100), "hours_before": round(hours, 1),
            "policy": [{"hours_before": h, "refund_percent": p} for h, p in tiers]}


@router.post("/bookings/{booking_id}/cancel")
def cancel(booking_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.get(Booking, booking_id)
    if not b or b.user_id != user.id:
        raise HTTPException(404, "Booking not found")
    refund = cancel_booking(db, b, by="player", actor_id=user.id)
    db.commit()
    return {"status": b.status, "refund": refund}


# --- payments ---------------------------------------------------------------

@router.post("/payments/order")
def create_order(body: PaymentOrderRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    bookings = _own_group(db, body.group_id, user)
    if any(b.status != "held" or b.hold_expires_at <= utcnow() for b in bookings):
        raise HTTPException(409, "Your hold expired. Please pick the slot again.")
    if body.pay_mode == "advance" and bookings[0].location.advance_percent >= 100:
        raise HTTPException(422, "This venue takes full payment only")
    amount = amount_due(bookings, body.pay_mode)
    s = get_settings()
    # Production: create a Razorpay order (with Route transfers to the venue's
    # linked account) and return its id; the hosted checkout keeps us out of PCI scope.
    order_id = f"order_{secrets.token_hex(7)}"
    db.add(Payment(tenant_id=bookings[0].tenant_id, group_id=body.group_id, gateway=s.payments_mode,
                   gateway_order_id=order_id, amount=amount))
    db.commit()
    return {"order_id": order_id, "amount": amount, "currency": "INR", "mode": s.payments_mode,
            "key_id": s.razorpay_key_id or None}


def _process_event(db: Session, event: dict) -> str:
    if event.get("event") != "payment.captured":
        return "ignored"
    entity = event["payload"]["payment"]["entity"]
    payment = db.scalar(select(Payment).where(Payment.gateway_order_id == entity["order_id"]).with_for_update())
    if not payment:
        return "unknown_order"
    result = apply_captured_payment(db, payment, entity["id"], round(entity["amount"] / 100))
    db.commit()
    return result


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, x_razorpay_signature: str = Header(""), db: Session = Depends(get_db)):
    body = await request.body()
    if not verify_razorpay_signature(body, x_razorpay_signature, get_settings().razorpay_webhook_secret):
        raise HTTPException(400, "Bad signature")
    return {"result": _process_event(db, json.loads(body))}


@router.post("/payments/mock/complete")
def mock_complete(body: MockPayRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Dev-only stand-in for the hosted checkout: feeds the same event the gateway
    webhook would carry into the same handler."""
    if get_settings().payments_mode != "mock":
        raise HTTPException(404)
    payment = db.scalar(select(Payment).where(Payment.gateway_order_id == body.order_id))
    if not payment:
        raise HTTPException(404, "Order not found")
    _own_group(db, payment.group_id, user)
    event = {"event": "payment.captured", "payload": {"payment": {"entity": {
        "id": f"pay_{secrets.token_hex(7)}", "order_id": body.order_id, "amount": payment.amount * 100}}}}
    result = _process_event(db, event)
    return {"result": result, **_group_out(group_bookings(db, payment.group_id), with_code=True)}
