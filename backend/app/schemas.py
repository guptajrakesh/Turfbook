from datetime import date, datetime, time

from pydantic import BaseModel, Field, field_validator

PHONE = r"^[6-9]\d{9}$"  # Indian mobile number, 10 digits
SPORTS = ("football", "cricket", "badminton", "pickleball", "tennis", "futsal", "basketball", "volleyball")


class OtpSend(BaseModel):
    phone: str = Field(pattern=PHONE)


class OtpVerify(BaseModel):
    phone: str = Field(pattern=PHONE)
    code: str = Field(pattern=r"^\d{6}$")
    name: str | None = Field(None, max_length=120)


class ProfileUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    email: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=80)


class HoldRequest(BaseModel):
    court_id: str
    starts_at: list[datetime] = Field(min_length=1, max_length=6)
    sport: str = ""


class PaymentOrderRequest(BaseModel):
    group_id: str
    pay_mode: str = Field("full", pattern="^(full|advance)$")


class MockPayRequest(BaseModel):
    order_id: str


class Onboard(BaseModel):
    business_name: str = Field(min_length=2, max_length=120)
    gstin: str | None = Field(None, pattern=r"^[0-9A-Z]{15}$")


class LocationIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address: str = ""
    area: str = ""
    city: str = Field(min_length=2)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    timezone: str = "Asia/Kolkata"
    open_time: time = time(6, 0)
    close_time: time = time(23, 0)
    amenities: list[str] = []
    photo_url: str | None = None
    description: str = ""
    advance_percent: int = Field(100, ge=10, le=100)
    is_active: bool = True


class CourtIn(BaseModel):
    location_id: str
    name: str = Field(min_length=1, max_length=80)
    sports: list[str] = Field(min_length=1)
    surface: str = ""
    base_price: int = Field(ge=0)
    is_active: bool = True

    @field_validator("sports")
    @classmethod
    def known_sports(cls, v: list[str]) -> list[str]:
        bad = [s for s in v if s not in SPORTS]
        if bad:
            raise ValueError(f"Unknown sport(s): {', '.join(bad)}")
        return v


class SlotRuleIn(BaseModel):
    slot_minutes: int = Field(60, ge=15, le=240)
    buffer_minutes: int = Field(0, ge=0, le=60)
    max_advance_days: int = Field(14, ge=1, le=90)
    min_notice_minutes: int = Field(30, ge=0, le=1440)


class PricingRuleIn(BaseModel):
    court_id: str
    label: str = ""
    day_of_week: int | None = Field(None, ge=0, le=6)
    start_time: time
    end_time: time
    price: int = Field(ge=0)
    priority: int = 0


class BlockIn(BaseModel):
    court_id: str
    starts_at: datetime
    ends_at: datetime
    reason: str = "Maintenance"


class WalkIn(BaseModel):
    court_id: str
    starts_at: list[datetime] = Field(min_length=1, max_length=12)
    customer_name: str = Field(min_length=1, max_length=120)
    customer_phone: str = ""
    sport: str = ""
    source: str = Field("walk_in", pattern="^(walk_in|phone)$")
    paid_amount: int | None = None  # cash collected; defaults to full amount


class CheckIn(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class PolicyTier(BaseModel):
    hours_before: int = Field(ge=0, le=720)
    refund_percent: int = Field(ge=0, le=100)


class MemberIn(BaseModel):
    phone: str = Field(pattern=PHONE)
    name: str | None = None
    role: str = Field(pattern="^(owner|manager|staff)$")
    location_ids: list[str] = []


class TenantIn(BaseModel):
    name: str
    owner_phone: str = Field(pattern=PHONE)
    plan_id: str | None = None
    gstin: str | None = None


class TenantPatch(BaseModel):
    status: str | None = Field(None, pattern="^(active|suspended)$")
    kyc_status: str | None = Field(None, pattern="^(pending|approved)$")
    plan_id: str | None = None


class PlanIn(BaseModel):
    name: str
    fixed_fee: int = Field(ge=0)
    per_booking_fee: int = Field(ge=0)
    billing_period: str = Field("year", pattern="^(month|year)$")


class DateRange(BaseModel):
    start: date
    end: date
