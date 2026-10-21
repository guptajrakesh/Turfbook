import threading
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.db import SessionLocal
from app.models import Booking, Court, Notification, Payment, PlatformFeeLedger
from app.timeutil import utcnow
from app.worker import tick

from .conftest import IS_PG, free_slot, login

API = "/api/v1"


def book(client, headers, court, starts, pay_mode="full"):
    held = client.post(f"{API}/bookings/hold", json={"court_id": court, "starts_at": starts}, headers=headers)
    assert held.status_code == 201, held.text
    group = held.json()["group_id"]
    order = client.post(f"{API}/payments/order", json={"group_id": group, "pay_mode": pay_mode}, headers=headers)
    assert order.status_code == 200, order.text
    paid = client.post(f"{API}/payments/mock/complete", json={"order_id": order.json()["order_id"]}, headers=headers)
    assert paid.status_code == 200, paid.text
    return paid.json()


def test_otp_login_and_profile(client, world):
    send = client.post(f"{API}/auth/otp/send", json={"phone": "9876543210"})
    code = send.json()["dev_code"]
    wrong = client.post(f"{API}/auth/otp/verify", json={"phone": "9876543210", "code": "000000" if code != "000000"
                                                          else "111111"})
    assert wrong.status_code == 400
    ok = client.post(f"{API}/auth/otp/verify", json={"phone": "9876543210", "code": code, "name": "Asha"})
    assert ok.status_code == 200
    assert ok.json()["user"]["name"] == "Asha"
    assert "turf_refresh" in ok.cookies or client.cookies.get("turf_refresh")
    refreshed = client.post(f"{API}/auth/refresh")
    assert refreshed.status_code == 200 and refreshed.json()["access_token"]
    # resend is rate-limited
    assert client.post(f"{API}/auth/otp/send", json={"phone": "9876543210"}).status_code == 200
    assert client.post(f"{API}/auth/otp/send", json={"phone": "9876543210"}).status_code == 429


def test_slot_grid_and_pricing(client, world):
    slots = client.get(f"{API}/courts/{world['court']}/slots",
                       params={"date": free_slot(client, world["court"])["starts_at"][:10]}).json()["slots"]
    assert len(slots) >= 23
    by_start = {s["start"]: s for s in slots}
    assert by_start["10:00"]["price"] == 1000
    assert by_start["19:00"]["price"] == 1500 and by_start["19:00"]["label"] == "Peak"


def test_hold_pay_confirm_and_fee(client, world):
    h = login(client, "9000000002")
    slot = free_slot(client, world["court"], hour="19:00")
    group = book(client, h, world["court"], [slot["starts_at"]])
    assert group["status"] == "confirmed"
    assert group["bookings"][0]["paid_amount"] == 1500
    assert len(group["bookings"][0]["checkin_code"]) == 6
    day = slot["starts_at"][:10]
    grid = client.get(f"{API}/courts/{world['court']}/slots", params={"date": day}).json()["slots"]
    assert next(s for s in grid if s["starts_at"] == slot["starts_at"])["status"] == "booked"
    with SessionLocal() as db:
        assert db.scalar(select(PlatformFeeLedger.amount)) == 5
        assert db.scalar(select(Notification.template)) == "booking_confirmed"
    mine = client.get(f"{API}/me/bookings", headers=h).json()
    assert len(mine["upcoming"]) == 1


def test_multi_slot_and_advance_payment(client, world):
    h = login(client, "9000000002")
    s1 = free_slot(client, world["court"], hour="10:00")
    s2 = free_slot(client, world["court"], hour="11:00")
    group = book(client, h, world["court"], [s1["starts_at"], s2["starts_at"]], pay_mode="advance")
    assert group["total"] == 2000
    assert sum(b["paid_amount"] for b in group["bookings"]) == 600  # 30% advance
    assert all(b["status"] == "confirmed" for b in group["bookings"])


def test_same_slot_cannot_be_held_twice(client, world):
    slot = free_slot(client, world["court"])
    a = login(client, "9000000002")
    b = login(client, "9000000009")
    assert client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [slot["starts_at"]]},
                       headers=a).status_code == 201
    second = client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [slot["starts_at"]]},
                         headers=b)
    assert second.status_code == 409


def test_walk_in_uses_same_path(client, world):
    slot = free_slot(client, world["court"])
    desk = login(client, "9000000003")
    r = client.post(f"{API}/owner/bookings/walk-in", headers=desk, json={
        "court_id": world["court"], "starts_at": [slot["starts_at"]], "customer_name": "Walk-in Ravi"})
    assert r.status_code == 201, r.text
    player = login(client, "9000000002")
    clash = client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [slot["starts_at"]]},
                        headers=player)
    assert clash.status_code == 409


def test_expired_hold_frees_slot_and_late_payment(client, world):
    h = login(client, "9000000002")
    slot = free_slot(client, world["court"])
    group = client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [slot["starts_at"]]},
                        headers=h).json()["group_id"]
    order = client.post(f"{API}/payments/order", json={"group_id": group}, headers=h).json()["order_id"]
    with SessionLocal() as db:
        db.execute(update(Booking).values(hold_expires_at=utcnow() - timedelta(seconds=1)))
        db.commit()
    assert tick()["expired"] == 1
    # slot is free again, but nobody took it: the late payment re-confirms
    paid = client.post(f"{API}/payments/mock/complete", json={"order_id": order}, headers=h).json()
    assert paid["result"] == "confirmed"


def test_late_payment_refunded_when_slot_taken(client, world):
    h = login(client, "9000000002")
    slot = free_slot(client, world["court"])
    group = client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [slot["starts_at"]]},
                        headers=h).json()["group_id"]
    order = client.post(f"{API}/payments/order", json={"group_id": group}, headers=h).json()["order_id"]
    with SessionLocal() as db:
        db.execute(update(Booking).values(hold_expires_at=utcnow() - timedelta(seconds=1)))
        db.commit()
    other = login(client, "9000000009")
    assert client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [slot["starts_at"]]},
                       headers=other).status_code == 201
    paid = client.post(f"{API}/payments/mock/complete", json={"order_id": order}, headers=h).json()
    assert paid["result"] == "refunded"
    with SessionLocal() as db:
        assert db.scalar(select(Payment.status).where(Payment.gateway_order_id == order)) == "refunded"


def test_webhook_signature_and_idempotency(client, world):
    import json

    from app.security import razorpay_signature

    h = login(client, "9000000002")
    slot = free_slot(client, world["court"])
    group = client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [slot["starts_at"]]},
                        headers=h).json()["group_id"]
    order = client.post(f"{API}/payments/order", json={"group_id": group}, headers=h).json()
    body = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {
        "id": "pay_X1", "order_id": order["order_id"], "amount": order["amount"] * 100}}}}).encode()
    bad = client.post(f"{API}/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": "nope"})
    assert bad.status_code == 400
    sig = razorpay_signature(body, "dev-webhook-secret")
    first = client.post(f"{API}/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": sig})
    again = client.post(f"{API}/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": sig})
    assert first.json()["result"] == "confirmed"
    assert again.json()["result"] == "duplicate"
    with SessionLocal() as db:
        assert db.scalar(select(PlatformFeeLedger.id).limit(1)) is not None
        assert len(db.scalars(select(PlatformFeeLedger)).all()) == 1


@pytest.mark.parametrize("hours_ahead,percent", [(48, 100), (10, 50), (2, 0)])
def test_cancellation_tiers(client, world, hours_ahead, percent):
    h = login(client, "9000000002")
    # the test venue opens at 00:00 IST, so slots start at :30 past each UTC hour
    target = utcnow() + timedelta(hours=hours_ahead)
    start = target.replace(minute=30, second=0, microsecond=0)
    if start < target:
        start += timedelta(hours=1)
    group = book(client, h, world["court"], [start.isoformat() + "Z"])
    bid = group["bookings"][0]["id"]
    quote = client.get(f"{API}/bookings/{bid}/cancel-quote", headers=h).json()
    assert quote["refund_percent"] == percent
    r = client.post(f"{API}/bookings/{bid}/cancel", headers=h).json()
    assert r["refund"] == round(group["bookings"][0]["paid_amount"] * percent / 100)
    with SessionLocal() as db:
        assert db.scalar(select(PlatformFeeLedger.reversed)) is (percent == 100)
    grid_day = group["bookings"][0]["date"]
    grid = client.get(f"{API}/courts/{world['court']}/slots", params={"date": grid_day}).json()["slots"]
    assert next(s for s in grid if s["starts_at"] == group["bookings"][0]["starts_at"])["status"] == "free"


def test_hold_cap_per_player(client, world):
    h = login(client, "9000000002")
    for hour in ("06:00", "07:00", "08:00"):
        s = free_slot(client, world["court"], hour=hour)
        assert client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [s["starts_at"]]},
                           headers=h).status_code == 201
    s = free_slot(client, world["court"], hour="09:00")
    assert client.post(f"{API}/bookings/hold", json={"court_id": world["court"], "starts_at": [s["starts_at"]]},
                       headers=h).status_code == 429


@pytest.mark.skipif(not IS_PG, reason="race needs Postgres exclusion constraint")
def test_database_rejects_racing_inserts(world):
    """Bypass the app-level check entirely: two sessions insert overlapping
    bookings at once; the exclusion constraint lets exactly one through."""
    from sqlalchemy.exc import IntegrityError

    from app.models import new_id

    start = (utcnow() + timedelta(days=3)).replace(minute=0, second=0, microsecond=0)
    results: list[str] = []
    barrier = threading.Barrier(2)

    def attempt():
        with SessionLocal() as db:
            court = db.get(Court, world["court"])
            db.add(Booking(tenant_id=court.tenant_id, location_id=court.location_id, court_id=court.id,
                           group_id=new_id(), starts_at=start, ends_at=start + timedelta(hours=1),
                           status="held", amount=1000, checkin_code="123456",
                           hold_expires_at=utcnow() + timedelta(minutes=10)))
            barrier.wait()
            try:
                db.commit()
                results.append("ok")
            except IntegrityError:
                results.append("rejected")

    threads = [threading.Thread(target=attempt) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == ["ok", "rejected"]
