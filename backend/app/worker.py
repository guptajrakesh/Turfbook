"""Background worker: expires unpaid holds, marks finished games completed and
drains the notifications outbox. Run with `python -m app.worker` (every minute
loop); on Render this is the background worker service."""

import logging
import time

from sqlalchemy import select, update

from .booking_service import expire_holds
from .db import SessionLocal, init_db
from .models import Booking, Notification
from .timeutil import utcnow

log = logging.getLogger("worker")


def complete_finished(db) -> int:
    return db.execute(
        update(Booking).where(Booking.status == "confirmed", Booking.ends_at <= utcnow()).values(status="completed")
    ).rowcount


def send_notifications(db, limit: int = 100) -> int:
    rows = db.scalars(select(Notification).where(Notification.status == "pending").limit(limit)).all()
    for n in rows:
        # Production: call the WhatsApp Cloud API / MSG91 / SES here, retry on failure.
        log.info("send %s %s to %s: %s", n.channel, n.template, n.phone, n.payload)
        n.status = "sent"
    return len(rows)


def tick() -> dict:
    with SessionLocal() as db:
        out = {"expired": expire_holds(db), "completed": complete_finished(db), "sent": send_notifications(db)}
        db.commit()
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_db()
    while True:
        log.info("tick %s", tick())
        time.sleep(60)
