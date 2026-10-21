# TurfTime: court booking SaaS

A multi-tenant booking platform for sports venues (turf, box cricket, badminton, pickleball, tennis, futsal). It follows the
[Court Booking SaaS — Product & Tech Spec](https://claude.ai/artifact/74g5ZmKSGARVfkAxvf2pSC). Players find nearby courts, see
live slots, pay and get a QR match ticket. Venue owners run their courts from one calendar, with walk-ins, check-in, pricing
rules and reports.

```
Turfbook/
  backend/    FastAPI + SQLAlchemy 2 + Pydantic v2 (API, slot engine, payments, worker, seed, tests)
  frontend/   React 18 + Vite + TypeScript + TanStack Query + Tailwind (player app + /owner dashboard)
  render.yaml Render blueprint (API, worker, Postgres)
```

## Run it locally

```bash
# API (SQLite by default; set DATABASE_URL to use Postgres)
cd backend
pip install -r requirements-dev.txt
python -m app.seed                      # demo venues, courts and three weeks of bookings
uvicorn app.main:app --reload --port 8000   # docs at http://localhost:8000/api/docs
python -m app.worker                    # optional: expires holds, sends the notification outbox

# Web (proxies /api to :8000)
cd ../frontend
npm install
npm run dev                             # http://localhost:5173
```

OTP codes appear on screen in dev mode. Demo logins:

| Phone | Role |
| --- | --- |
| 9999900002 | Player |
| 9999900001 | Venue owner, Kickoff Arenas (5 locations) |
| 9999900003 | Front-desk staff, Kickoff Arena Andheri West |
| 9999900004 | Venue owner, Smash Republic |
| 9999900000 | Platform admin (open `/owner`) |

Payments run in `PAYMENTS_MODE=mock`. That path sends the same `payment.captured` event a Razorpay webhook carries through the
same handler. Set `PAYMENTS_MODE=razorpay` with real keys to use the hosted checkout and the signed `/api/v1/webhooks/razorpay`.

## Tests

```bash
cd backend
pytest -q                                                    # SQLite
docker compose up -d db                                      # or any Postgres 16
TEST_DATABASE_URL=postgresql+psycopg://turf:turf@localhost/turf pytest -q
```

The Postgres run includes a race test: two sessions insert the same slot at once, and the exclusion constraint lets exactly
one through. CI runs both suites, plus `ruff` and the frontend type-check and build (`.github/workflows/ci.yml`).

## What maps to the spec

| Spec area | Where |
| --- | --- |
| Six roles, tenant + location scoping | `deps.py` (`require_role`, `TenantCtx`), `memberships.location_ids` |
| Slot engine (computed on read, rules → grid → subtract blocks/bookings → price) | `slots.py` |
| Zero double bookings: `EXCLUDE USING gist (court_id WITH =, tsrange(...) WITH &&)` | `db.py`; every channel goes through `booking_service.insert_bookings` |
| 10-minute hold, auto-release, late payment re-confirm or auto-refund, idempotent webhooks | `booking_service.py`, `worker.py`, `routers/bookings.py` |
| Full or advance payment, tiered cancellation refunds, fee reversal on full refunds | `booking_service.py`, `routers/bookings.py` |
| Hybrid pricing: `plans`, `platform_fee_ledger` row per confirmed online booking | `models.py`, `seed.py` |
| Location-first discovery (GPS after an explainer, 10 → 25 km → city-wide, coordinates never stored) | `routers/public.py`, `frontend/src/lib/session.tsx`, `pages/Home.tsx` |
| Owner onboarding, booking link + QR poster, calendar, walk-in/phone, blocks, QR/OTP check-in, no-show | `routers/owner.py`, `pages/owner/*` |
| Reports: revenue by day/court/location, occupancy % | `routers/owner.py`, `pages/owner/Reports.tsx` |
| Notifications outbox (WhatsApp/SMS/email) | `models.Notification`, `worker.py` |
| Security: OTP rate limit, 15-min JWT + httpOnly refresh cookie, hold cap per player, audit log, delete-my-account | `routers/auth.py`, `security.py`, `booking_service.py` |

## Design

The visual language is a night match under floodlights: mown-turf stripes, chalk pitch markings, floodlight lime for
actions, scoreboard digits (Oxanium) for times and prices, and condensed display type (Bebas Neue) for headings. Slots look
like a scoreboard and confirmed bookings are match tickets with a perforated QR stub. The owner side is the "dugout": Matchday
KPIs, a courts × time calendar, a gate check-in screen and season stats.

## Not in this MVP (stubs to swap for real providers)

- **SMS/WhatsApp/email**: the worker logs outbox rows. Wire MSG91 or Twilio Verify for OTP, the WhatsApp Cloud API, and SES.
- **Razorpay Route transfers and real refunds**: refunds are recorded on the payment row, and the gateway refund API call goes in `cancel_booking`.
- **PostGIS**: distance uses haversine in Python. Swap in `ST_DWithin` plus a KNN index once venue counts grow.
- **Postgres Row-Level Security** (the spec's second isolation layer), Alembic migrations, and the Redis 30-second slot cache.
- The player and owner apps share one Vite build. The owner dashboard is a separate lazy-loaded chunk, not a second app.
- v2 items: memberships, split payments, tournaments, broadcasts, React Native.
