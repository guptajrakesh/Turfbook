from collections.abc import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def normalize_url(url: str) -> str:
    """Hosts such as Render hand out postgres:// URLs; use the psycopg 3 driver."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def make_engine(url: str):
    url = normalize_url(url)
    kwargs = {"future": True, "pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")
    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# The database, not the UI, decides who gets a contested slot. On Postgres an
# exclusion constraint makes overlapping active bookings on one court impossible,
# whichever channel (app, walk-in, phone) inserts them.
NO_DOUBLE_BOOKING_DDL = [
    "CREATE EXTENSION IF NOT EXISTS btree_gist",
    """
    DO $$ BEGIN
      ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (court_id WITH =, tsrange(starts_at, ends_at) WITH &&)
        WHERE (status IN ('held', 'confirmed'));
    EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
    """,
]


def init_db(bind=None) -> None:
    from . import models  # noqa: F401  (registers tables)

    bind = bind or engine
    Base.metadata.create_all(bind)
    if bind.dialect.name == "postgresql":
        with bind.begin() as conn:
            for stmt in NO_DOUBLE_BOOKING_DDL:
                conn.execute(text(stmt))
