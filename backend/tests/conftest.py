import os
import tempfile
from datetime import time, timedelta

import pytest

# Use TEST_DATABASE_URL (Postgres) when given, else a throwaway SQLite file.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["OTP_DEV_MODE"] = "true"
os.environ["PAYMENTS_MODE"] = "mock"

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    CancellationPolicy,
    Court,
    Location,
    Membership,
    Plan,
    PricingRule,
    SlotRule,
    Tenant,
    User,
)

IS_PG = engine.dialect.name == "postgresql"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    init_db()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def login(client: TestClient, phone: str) -> dict:
    code = client.post("/api/v1/auth/otp/send", json={"phone": phone}).json()["dev_code"]
    data = client.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": code}).json()
    return {"Authorization": f"Bearer {data['access_token']}"}


@pytest.fixture
def world():
    """Two tenants. Tenant A: one Mumbai venue (00:00–24:00 so tests can book any
    hour), one court, 60-minute slots, peak 18:00–24:00. Tenant B: one venue."""
    with SessionLocal() as db:
        plan = Plan(name="Hybrid", fixed_fee=2400, per_booking_fee=5)
        db.add(plan)
        db.flush()
        a = Tenant(name="Kickoff", plan_id=plan.id, kyc_status="approved")
        b = Tenant(name="Rival", plan_id=plan.id)
        db.add_all([a, b])
        db.flush()
        owner = User(phone="9000000001", name="Owner A")
        staff = User(phone="9000000003", name="Desk A")
        owner_b = User(phone="9000000004", name="Owner B")
        player = User(phone="9000000002", name="Player")
        db.add_all([owner, staff, owner_b, player])
        db.flush()
        loc = Location(tenant_id=a.id, name="Kickoff Andheri", slug="kickoff-andheri", area="Andheri West",
                       city="Mumbai", lat=19.1364, lng=72.8296, open_time=time(0), close_time=time(0),
                       advance_percent=30)
        loc_b = Location(tenant_id=b.id, name="Rival Powai", slug="rival-powai", area="Powai", city="Mumbai",
                         lat=19.1176, lng=72.9060)
        db.add_all([loc, loc_b])
        db.flush()
        court = Court(tenant_id=a.id, location_id=loc.id, name="Turf A", sports=["football", "cricket"],
                      base_price=1000)
        court.slot_rule = SlotRule(slot_minutes=60, buffer_minutes=0, max_advance_days=14, min_notice_minutes=0)
        court_b = Court(tenant_id=b.id, location_id=loc_b.id, name="Court 1", sports=["badminton"], base_price=500)
        db.add_all([court, court_b])
        db.flush()
        db.add(PricingRule(tenant_id=a.id, court_id=court.id, label="Peak", start_time=time(18), end_time=time(0),
                           price=1500, priority=10))
        db.add_all([
            Membership(user_id=owner.id, tenant_id=a.id, role="owner", location_ids=[]),
            Membership(user_id=staff.id, tenant_id=a.id, role="staff", location_ids=[loc.id]),
            Membership(user_id=owner_b.id, tenant_id=b.id, role="owner", location_ids=[]),
        ])
        db.add_all(CancellationPolicy(tenant_id=a.id, hours_before=h, refund_percent=p)
                   for h, p in [(24, 100), (6, 50), (0, 0)])
        db.commit()
        return {"court": court.id, "court_b": court_b.id, "loc": loc.id, "loc_b": loc_b.id, "tenant": a.id}


def free_slot(client: TestClient, court_id: str, days_ahead: int = 2, hour: str | None = None) -> dict:
    from datetime import date

    from app.timeutil import local_today

    day: date = local_today("Asia/Kolkata") + timedelta(days=days_ahead)
    slots = client.get(f"/api/v1/courts/{court_id}/slots", params={"date": day.isoformat()}).json()["slots"]
    return next(s for s in slots if s["status"] == "free" and (hour is None or s["start"] == hour))
