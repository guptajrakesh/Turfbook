from datetime import timedelta

from app.timeutil import local_today

from .conftest import free_slot, login
from .test_booking import book

API = "/api/v1"


def test_tenant_isolation(client, world):
    owner_b = login(client, "9000000004")
    assert client.get(f"{API}/owner/calendar", params={"location": world["loc"]}, headers=owner_b).status_code == 404
    r = client.post(f"{API}/owner/courts", headers=owner_b, json={
        "location_id": world["loc"], "name": "Sneaky", "sports": ["football"], "base_price": 1})
    assert r.status_code == 404
    locs = client.get(f"{API}/owner/locations", headers=owner_b).json()
    assert [loc["id"] for loc in locs] == [world["loc_b"]]


def test_roles(client, world):
    staff = login(client, "9000000003")
    player = login(client, "9000000002")
    body = {"name": "New", "city": "Mumbai", "lat": 19.0, "lng": 72.8}
    assert client.post(f"{API}/owner/locations", json=body, headers=staff).status_code == 403
    assert client.get(f"{API}/owner/calendar", params={"location": world["loc"]}, headers=player).status_code == 403
    assert client.get(f"{API}/owner/calendar", params={"location": world["loc"]}, headers=staff).status_code == 200
    assert client.get(f"{API}/admin/tenants", headers=staff).status_code == 403


def test_onboarding_setup_and_booking_link(client, world):
    h = login(client, "9111111111")
    session = client.post(f"{API}/owner/onboard", json={"business_name": "Goal Getters"}, headers=h).json()
    h = {"Authorization": f"Bearer {session['access_token']}"}
    assert session["tenant"]["role"] == "owner"
    loc = client.post(f"{API}/owner/locations", headers=h, json={
        "name": "Goal Getters", "area": "Baner", "city": "Pune", "lat": 18.559, "lng": 73.786}).json()
    court = client.post(f"{API}/owner/courts", headers=h, json={
        "location_id": loc["id"], "name": "Turf 1", "sports": ["football"], "base_price": 900}).json()
    assert client.put(f"{API}/owner/courts/{court['id']}/slot-rule", headers=h, json={
        "slot_minutes": 90, "buffer_minutes": 15}).status_code == 200
    detail = client.get(f"{API}/venues/{loc['slug']}").json()
    assert detail["courts"][0]["name"] == "Turf 1"
    slots = client.get(f"{API}/courts/{court['id']}/slots",
                       params={"date": (local_today("Asia/Kolkata") + timedelta(days=1)).isoformat()}).json()
    first, second = slots["slots"][:2]
    assert (first["start"], first["end"], second["start"]) == ("06:00", "07:30", "07:45")
    assert len(client.get(f"{API}/owner/cancellation-policy", headers=h).json()) == 3


def test_block_check_in_and_reports(client, world):
    owner = login(client, "9000000001")
    player = login(client, "9000000002")
    slot = free_slot(client, world["court"], hour="20:00")
    group = book(client, player, world["court"], [slot["starts_at"]])
    booking = group["bookings"][0]

    block_slot = free_slot(client, world["court"], hour="07:00")
    r = client.post(f"{API}/owner/blocks", headers=owner, json={
        "court_id": world["court"], "starts_at": block_slot["starts_at"], "ends_at": block_slot["ends_at"]})
    assert r.status_code == 201
    grid = client.get(f"{API}/courts/{world['court']}/slots", params={"date": booking["date"]}).json()["slots"]
    assert next(s for s in grid if s["start"] == "07:00")["status"] == "blocked"

    desk = login(client, "9000000003")
    wrong = "000000" if booking["checkin_code"] != "000000" else "111111"
    bad = client.post(f"{API}/owner/bookings/{booking['id']}/check-in", json={"code": wrong}, headers=desk)
    assert bad.status_code == 400
    ok = client.post(f"{API}/owner/bookings/{booking['id']}/check-in", json={"code": booking["checkin_code"]},
                     headers=desk)
    assert ok.json()["checked_in"] is True

    day = booking["date"]
    rev = client.get(f"{API}/owner/reports/revenue", params={"start": day, "end": day}, headers=owner).json()
    assert rev["totals"]["online"] == 1500 and rev["totals"]["bookings"] == 1
    occ = client.get(f"{API}/owner/reports/occupancy", params={"start": day, "end": day}, headers=owner).json()
    assert occ[0]["booked"] == 1 and occ[0]["slots"] == 23  # 24 hourly slots minus one blocked


def test_discovery_nearest_first(client, world):
    # standing in Powai: the Powai venue (0 km) comes before Andheri (~8 km)
    r = client.get(f"{API}/venues", params={"lat": 19.1176, "lng": 72.9060}).json()
    names = [v["name"] for v in r["venues"]]
    assert names == ["Rival Powai", "Kickoff Andheri"]
    assert r["venues"][0]["distance_km"] == 0.0
    assert r["venues"][1]["next_slot"] is not None
    only_badminton = client.get(f"{API}/venues", params={"sport": "badminton"}).json()["venues"]
    assert [v["name"] for v in only_badminton] == ["Rival Powai"]
    area = client.get(f"{API}/geo/nearest-area", params={"lat": 19.137, "lng": 72.83}).json()
    assert area == {"area": "Andheri West", "city": "Mumbai"}
