from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    """Naive UTC 'now' — the storage convention for every datetime column."""
    return datetime.now(UTC).replace(tzinfo=None)


def local_to_utc(d: date, t: time, tz: str) -> datetime:
    return datetime.combine(d, t, ZoneInfo(tz)).astimezone(UTC).replace(tzinfo=None)


def utc_to_local(dt: datetime, tz: str) -> datetime:
    return dt.replace(tzinfo=UTC).astimezone(ZoneInfo(tz))


def local_today(tz: str) -> date:
    return datetime.now(ZoneInfo(tz)).date()


def iso_utc(dt: datetime | None) -> str | None:
    return None if dt is None else dt.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


def to_naive_utc(dt: datetime) -> datetime:
    """API input: aware datetimes are converted, naive ones are taken as UTC."""
    return dt if dt.tzinfo is None else dt.astimezone(UTC).replace(tzinfo=None)
