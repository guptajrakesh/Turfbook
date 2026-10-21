"""Demo data: three cities, two venue businesses, a few weeks of history.

    python -m app.seed            # create tables and load demo data (idempotent)
    python -m app.seed --reset    # drop everything first

Demo logins (OTP is shown on screen in dev mode):
    9999900001  venue owner (Kickoff Arenas: 5 locations)
    9999900003  front-desk staff at Kickoff Arena Andheri
    9999900002  player
    9999900000  platform admin
"""

import random
import secrets
import sys
from datetime import datetime, time, timedelta

from sqlalchemy import select

from .booking_service import DEFAULT_POLICY
from .db import Base, SessionLocal, engine, init_db
from .models import (
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
    new_id,
)
from .slots import court_slots
from .timeutil import local_today, utcnow

PHOTOS = {
    "football": "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=1200&q=70",
    "cricket": "https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=1200&q=70",
    "badminton": "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1200&q=70",
    "pickleball": "https://images.unsplash.com/photo-1693142518820-78d7a05f1546?w=1200&q=70",
    "tennis": "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=1200&q=70",
    "futsal": "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=1200&q=70",
}

# (business, name, area, city, lat, lng, open, close, amenities, courts[(name, sports, surface, base, peak, slot_min)])
VENUES = [
    ("Kickoff Arenas", "Kickoff Arena", "Andheri West", "Mumbai", 19.1364, 72.8296, time(6), time(0),
     ["Floodlights", "Parking", "Changing rooms", "Drinking water"],
     [("Turf A · 7-a-side", ["football", "cricket"], "FIFA-grade artificial turf", 1400, 2000, 60),
      ("Turf B · 5-a-side", ["football", "futsal"], "Artificial turf", 1000, 1500, 60)]),
    ("Kickoff Arenas", "Kickoff Arena", "Powai", "Mumbai", 19.1176, 72.9060, time(6), time(23),
     ["Floodlights", "Cafe", "Parking"],
     [("Box Cricket 1", ["cricket"], "Netted box, artificial turf", 1200, 1800, 60),
      ("Pickleball Court", ["pickleball"], "Acrylic hard court", 600, 800, 60)]),
    ("Kickoff Arenas", "Kickoff Arena", "Bandra West", "Mumbai", 19.0596, 72.8295, time(7), time(23),
     ["Floodlights", "Showers", "Equipment rental"],
     [("Rooftop Turf", ["football"], "Artificial turf", 1600, 2400, 60)]),
    ("Kickoff Arenas", "Kickoff Arena", "Koramangala", "Bengaluru", 12.9352, 77.6245, time(6), time(23),
     ["Floodlights", "Parking", "Cafe"],
     [("Main Turf", ["football", "cricket"], "Artificial turf", 1300, 1900, 60),
      ("Shuttle Court 1", ["badminton"], "Wooden, BWF mat", 400, 600, 60),
      ("Shuttle Court 2", ["badminton"], "Wooden, BWF mat", 400, 600, 60)]),
    ("Kickoff Arenas", "Kickoff Arena", "Baner", "Pune", 18.5590, 73.7868, time(6), time(23),
     ["Floodlights", "Parking"],
     [("Turf 1", ["football", "cricket"], "Artificial turf", 1000, 1500, 60)]),
    ("Smash Republic", "Smash Republic", "Indiranagar", "Bengaluru", 12.9719, 77.6412, time(6), time(22),
     ["AC hall", "Pro shop", "Coaching"],
     [("Court 1", ["badminton"], "Synthetic mat", 500, 700, 60),
      ("Court 2", ["badminton"], "Synthetic mat", 500, 700, 60),
      ("Pickle Pit", ["pickleball"], "Acrylic hard court", 700, 900, 60)]),
    ("Smash Republic", "Smash Republic", "HSR Layout", "Bengaluru", 12.9116, 77.6474, time(6), time(22),
     ["Floodlights", "Parking"],
     [("Clay Court", ["tennis"], "Red clay", 800, 1100, 60),
      ("Hard Court", ["tennis", "pickleball"], "Hard court", 700, 1000, 60)]),
    ("Smash Republic", "Smash Republic", "Kothrud", "Pune", 18.5074, 73.8077, time(6), time(22),
     ["AC hall", "Parking"],
     [("Court A", ["badminton"], "Wooden", 450, 650, 60)]),
]


def run(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    init_db()
    with SessionLocal() as db:
        if db.scalar(select(Tenant.id)):
            print("Demo data already loaded (use --reset to reload)")
            return
        rng = random.Random(7)
        plans = {
            "Subscription": Plan(name="Subscription", fixed_fee=6000, per_booking_fee=0, billing_period="year"),
            "Per booking": Plan(name="Per booking", fixed_fee=0, per_booking_fee=10, billing_period="year"),
            "Hybrid": Plan(name="Hybrid", fixed_fee=2400, per_booking_fee=5, billing_period="year"),
        }
        db.add_all(plans.values())
        admin = User(phone="9999900000", name="Platform Admin", is_platform_admin=True)
        owner = User(phone="9999900001", name="Arjun Mehta", city="Mumbai")
        player = User(phone="9999900002", name="Priya Nair", city="Mumbai")
        desk = User(phone="9999900003", name="Rahul (Front desk)")
        owner2 = User(phone="9999900004", name="Kavya Rao", city="Bengaluru")
        db.add_all([admin, owner, player, desk, owner2])
        db.flush()

        tenants: dict[str, Tenant] = {}
        for business, owner_user in (("Kickoff Arenas", owner), ("Smash Republic", owner2)):
            t = Tenant(name=business, plan_id=plans["Hybrid"].id, gstin="27AAPFU0939F1ZV", kyc_status="approved")
            db.add(t)
            db.flush()
            tenants[business] = t
            db.add(Membership(user_id=owner_user.id, tenant_id=t.id, role="owner", location_ids=[]))
            db.add_all(CancellationPolicy(tenant_id=t.id, hours_before=h, refund_percent=p) for h, p in DEFAULT_POLICY)

        all_courts: list[Court] = []
        for business, name, area, city, lat, lng, open_t, close_t, amenities, courts in VENUES:
            t = tenants[business]
            main_sport = courts[0][1][0]
            slug = f"{name}-{area}-{city}".lower().replace(" ", "-")
            loc = Location(tenant_id=t.id, name=f"{name} {area}", slug=slug, area=area, city=city,
                           address=f"{area}, {city}", lat=lat, lng=lng, open_time=open_t, close_time=close_t,
                           amenities=amenities, photo_url=PHOTOS[main_sport], advance_percent=30 if
                           business == "Kickoff Arenas" else 100,
                           description=f"{name} in {area}: floodlit courts, quick check-in with your booking QR.")
            db.add(loc)
            db.flush()
            if area == "Andheri West":
                db.add(Membership(user_id=desk.id, tenant_id=t.id, role="staff", location_ids=[loc.id]))
            for cname, sports, surface, base, peak, slot_min in courts:
                c = Court(tenant_id=t.id, location_id=loc.id, name=cname, sports=sports, surface=surface,
                          base_price=base)
                c.slot_rule = SlotRule(slot_minutes=slot_min, buffer_minutes=0, max_advance_days=14,
                                       min_notice_minutes=15)
                db.add(c)
                db.flush()
                db.add_all([
                    PricingRule(tenant_id=t.id, court_id=c.id, label="Peak", start_time=time(18),
                                end_time=time(0), price=peak, priority=10),
                    PricingRule(tenant_id=t.id, court_id=c.id, label="Weekend", day_of_week=5,
                                start_time=time(6), end_time=time(0), price=peak, priority=20),
                    PricingRule(tenant_id=t.id, court_id=c.id, label="Weekend", day_of_week=6,
                                start_time=time(6), end_time=time(0), price=peak, priority=20),
                    PricingRule(tenant_id=t.id, court_id=c.id, label="Early bird", start_time=time(6),
                                end_time=time(8), price=round(base * 0.8 / 50) * 50, priority=5),
                ])
                all_courts.append(c)
        db.flush()

        # Three weeks of history plus some of today and the next few days.
        names = ["Rohan", "Aditi", "Sameer", "Neha", "Vikram", "Ishaan", "Meera", "Karan", "Zoya", "Dev"]
        for c in all_courts:
            db.refresh(c)
            today = local_today(c.location.timezone)
            for offset in range(-21, 4):
                day = today + timedelta(days=offset)
                # pretend "now" is the day before so past slots are offered as free
                slots = court_slots(db, c, day, now=datetime.combine(day - timedelta(days=1), time(0)))
                for s in slots:
                    evening = s.local_start.hour >= 17
                    p = (0.75 if evening else 0.3) * (0.5 if offset > 0 else 1)
                    if s.status != "free" or rng.random() > p:
                        continue
                    online = rng.random() < 0.7
                    past = s.ends_at <= utcnow()
                    b = Booking(
                        tenant_id=c.tenant_id, location_id=c.location_id, court_id=c.id,
                        user_id=player.id if online and rng.random() < 0.15 else None, group_id=new_id(),
                        customer_name=rng.choice(names),
                        customer_phone=f"98{rng.randrange(10**8):08d}", sport=rng.choice(c.sports),
                        starts_at=s.starts_at, ends_at=s.ends_at,
                        status="completed" if past else "confirmed",
                        source="online" if online else rng.choice(["walk_in", "phone"]),
                        amount=s.price, paid_amount=s.price, checkin_code=f"{secrets.randbelow(10**6):06d}",
                    )
                    if b.user_id:
                        b.customer_name, b.customer_phone = player.name, player.phone
                    db.add(b)
                    if online:
                        db.flush()
                        db.add(PlatformFeeLedger(tenant_id=c.tenant_id, booking_id=b.id,
                                                 amount=plans["Hybrid"].per_booking_fee, created_at=s.starts_at))
        db.commit()
        print("Demo data loaded:", len(VENUES), "venues,", len(all_courts), "courts")


if __name__ == "__main__":
    run(reset="--reset" in sys.argv)
