"""Tables from the spec's data model. All datetimes are naive UTC; each location
carries its own IANA time zone for display and slot generation."""

import uuid
from datetime import datetime, time

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .timeutil import utcnow


def new_id() -> str:
    return uuid.uuid4().hex


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80))
    fixed_fee: Mapped[int] = mapped_column(Integer, default=0)  # ₹ per billing period per location
    per_booking_fee: Mapped[int] = mapped_column(Integer, default=0)  # ₹ per online booking
    billing_period: Mapped[str] = mapped_column(String(16), default="year")


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("plans.id"))
    status: Mapped[str] = mapped_column(String(16), default="active")  # active, suspended
    gstin: Mapped[str | None] = mapped_column(String(15))
    kyc_status: Mapped[str] = mapped_column(String(16), default="pending")  # pending, approved
    payout_account_ref: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    plan: Mapped[Plan | None] = relationship()


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(200))
    name: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(80))  # last chosen city, never raw GPS
    auth_provider: Mapped[str] = mapped_column(String(16), default="otp")
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "tenant_id"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # owner, manager, staff
    location_ids: Mapped[list[str]] = mapped_column(JSON, default=list)  # empty = all locations

    user: Mapped[User] = relationship()
    tenant: Mapped[Tenant] = relationship()


class Location(Base):
    __tablename__ = "locations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    address: Mapped[str] = mapped_column(String(300), default="")
    area: Mapped[str] = mapped_column(String(80), default="")
    city: Mapped[str] = mapped_column(String(80), index=True)
    lat: Mapped[float] = mapped_column()
    lng: Mapped[float] = mapped_column()
    timezone: Mapped[str] = mapped_column(String(40), default="Asia/Kolkata")
    open_time: Mapped[time] = mapped_column(Time, default=time(6, 0))
    close_time: Mapped[time] = mapped_column(Time, default=time(23, 0))  # 00:00 means midnight
    amenities: Mapped[list[str]] = mapped_column(JSON, default=list)
    photo_url: Mapped[str | None] = mapped_column(String(400))
    description: Mapped[str] = mapped_column(Text, default="")
    advance_percent: Mapped[int] = mapped_column(Integer, default=100)  # 100 = full payment only
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    tenant: Mapped[Tenant] = relationship()
    courts: Mapped[list["Court"]] = relationship(back_populates="location", order_by="Court.name")


class Court(Base):
    __tablename__ = "courts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[str] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    sports: Mapped[list[str]] = mapped_column(JSON, default=list)
    surface: Mapped[str] = mapped_column(String(40), default="")
    base_price: Mapped[int] = mapped_column(Integer, default=1000)  # ₹ per slot when no rule matches
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    location: Mapped[Location] = relationship(back_populates="courts")
    slot_rule: Mapped["SlotRule | None"] = relationship(uselist=False, cascade="all, delete-orphan")
    pricing_rules: Mapped[list["PricingRule"]] = relationship(cascade="all, delete-orphan")


class SlotRule(Base):
    __tablename__ = "slot_rules"
    court_id: Mapped[str] = mapped_column(ForeignKey("courts.id", ondelete="CASCADE"), primary_key=True)
    slot_minutes: Mapped[int] = mapped_column(Integer, default=60)
    buffer_minutes: Mapped[int] = mapped_column(Integer, default=0)
    max_advance_days: Mapped[int] = mapped_column(Integer, default=14)
    min_notice_minutes: Mapped[int] = mapped_column(Integer, default=30)


class PricingRule(Base):
    __tablename__ = "pricing_rules"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    court_id: Mapped[str] = mapped_column(ForeignKey("courts.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(40), default="")
    day_of_week: Mapped[int | None] = mapped_column(Integer)  # 0 = Monday; None = every day
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)  # 00:00 means end of day
    price: Mapped[int] = mapped_column(Integer)
    priority: Mapped[int] = mapped_column(Integer, default=0)


class Block(Base):
    __tablename__ = "blocks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    court_id: Mapped[str] = mapped_column(ForeignKey("courts.id", ondelete="CASCADE"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    reason: Mapped[str] = mapped_column(String(120), default="Maintenance")


ACTIVE_STATUSES = ("held", "confirmed")


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[str] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    court_id: Mapped[str] = mapped_column(ForeignKey("courts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    group_id: Mapped[str] = mapped_column(String(32), index=True)  # slots booked and paid together
    customer_name: Mapped[str] = mapped_column(String(120), default="")
    customer_phone: Mapped[str] = mapped_column(String(15), default="")
    sport: Mapped[str] = mapped_column(String(30), default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(16), default="held")  # held, confirmed, cancelled, completed, no_show
    source: Mapped[str] = mapped_column(String(16), default="online")  # online, walk_in, phone
    amount: Mapped[int] = mapped_column(Integer)
    paid_amount: Mapped[int] = mapped_column(Integer, default=0)
    refunded_amount: Mapped[int] = mapped_column(Integer, default=0)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    checkin_code: Mapped[str] = mapped_column(String(6))
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_by: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    court: Mapped[Court] = relationship()
    location: Mapped[Location] = relationship()


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[str] = mapped_column(String(32), index=True)
    gateway: Mapped[str] = mapped_column(String(16))
    gateway_order_id: Mapped[str] = mapped_column(String(64), unique=True)
    gateway_ref: Mapped[str | None] = mapped_column(String(64), unique=True)  # webhook idempotency key
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24), default="created")  # created, captured, (partially_)refunded
    refunded_amount: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CancellationPolicy(Base):
    __tablename__ = "cancellation_policies"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    hours_before: Mapped[int] = mapped_column(Integer)
    refund_percent: Mapped[int] = mapped_column(Integer)


class PlatformFeeLedger(Base):
    __tablename__ = "platform_fee_ledger"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), unique=True)
    amount: Mapped[int] = mapped_column(Integer)
    reversed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    period: Mapped[str] = mapped_column(String(16))  # e.g. 2026-10
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="draft")


class Notification(Base):
    """Outbox: rows are written in the booking transaction and sent by the worker."""

    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    phone: Mapped[str] = mapped_column(String(15), default="")
    channel: Mapped[str] = mapped_column(String(16))  # whatsapp, sms, email
    template: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OtpCode(Base):
    __tablename__ = "otp_codes"
    phone: Mapped[str] = mapped_column(String(15), primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(40))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(32))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
