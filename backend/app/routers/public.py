import math
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Court, Location, Tenant
from ..serializers import court_out, location_out, slot_out
from ..slots import court_slots, next_free_slot
from ..timeutil import local_today

router = APIRouter(tags=["discovery"])

RADII_KM = (10, 25)  # widen when fewer than MIN_RESULTS venues are found, then city-wide
MIN_RESULTS = 5


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    # Production swaps this for PostGIS ST_DWithin + a KNN index on locations.geo.
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _bookable(db: Session):
    return (
        select(Location)
        .join(Tenant)
        .where(Location.is_active, Tenant.status == "active")
        .options(selectinload(Location.courts).selectinload(Court.slot_rule))
    )


@router.get("/venues")
def search_venues(
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = Query(None, gt=0, le=100),
    city: str | None = None,
    sport: str | None = None,
    q: str | None = None,
    on: date | None = Query(None, alias="date"),
    db: Session = Depends(get_db),
):
    stmt = _bookable(db)
    if city:
        stmt = stmt.where(func.lower(Location.city) == city.lower())
    venues = db.scalars(stmt).unique().all()
    if sport:
        venues = [v for v in venues if any(sport in c.sports and c.is_active for c in v.courts)]
    if q:
        needle = q.lower()
        venues = [v for v in venues if needle in f"{v.name} {v.area} {v.city}".lower()]

    radius_used = None
    if lat is not None and lng is not None:
        dist = {v.id: haversine_km(lat, lng, v.lat, v.lng) for v in venues}
        venues.sort(key=lambda v: dist[v.id])
        if not city:
            for r in ((radius_km,) if radius_km else RADII_KM):
                near = [v for v in venues if dist[v.id] <= r]
                if len(near) >= MIN_RESULTS:
                    venues, radius_used = near, r
                    break
            else:  # city-wide: the city of the nearest venue
                if venues:
                    nearest_city = venues[0].city
                    venues = [v for v in venues if v.city == nearest_city or dist[v.id] <= RADII_KM[-1]]
    else:
        dist = {}
        venues.sort(key=lambda v: (v.city, v.name))

    out = []
    for v in venues[:50]:
        day = on or local_today(v.timezone)
        nxt = next_free_slot(db, v.courts, day, sport)
        active = [c for c in v.courts if c.is_active and (not sport or sport in c.sports)]
        item = location_out(v)
        item.update(
            distance_km=round(dist[v.id], 1) if v.id in dist else None,
            courts_count=len(active),
            price_from=min((c.base_price for c in active), default=None),
            next_slot=slot_out(nxt) if nxt else None,
        )
        out.append(item)
    return {"venues": out, "radius_km": radius_used}


@router.get("/cities")
def cities(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Location.city, func.count()).where(Location.is_active).group_by(Location.city).order_by(Location.city)
    ).all()
    return [{"city": c, "venues": n} for c, n in rows]


@router.get("/geo/nearest-area")
def nearest_area(lat: float, lng: float, db: Session = Depends(get_db)):
    """Labels the player's position by the nearest known venue area. Coordinates
    are used for this request only and never stored. (Production: Google Geocoding.)"""
    venues = db.scalars(select(Location).where(Location.is_active)).all()
    if not venues:
        return {"area": None, "city": None}
    v = min(venues, key=lambda v: haversine_km(lat, lng, v.lat, v.lng))
    km = haversine_km(lat, lng, v.lat, v.lng)
    return {"area": v.area if km < 5 else None, "city": v.city if km < 60 else None}


@router.get("/venues/{slug}")
def venue_detail(slug: str, db: Session = Depends(get_db)):
    v = db.scalars(_bookable(db).where(Location.slug == slug)).first()
    if not v:
        raise HTTPException(404, "Venue not found")
    out = location_out(v, courts=True)
    out["business"] = v.tenant.name
    return out


@router.get("/courts/{court_id}/slots")
def slots(court_id: str, on: date | None = Query(None, alias="date"), db: Session = Depends(get_db)):
    court = db.get(Court, court_id)
    if not court or not court.is_active:
        raise HTTPException(404, "Court not found")
    day = on or local_today(court.location.timezone)
    return {"court": court_out(court), "date": day.isoformat(),
            "slots": [slot_out(s) for s in court_slots(db, court, day)]}
