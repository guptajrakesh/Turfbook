from datetime import timedelta

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..models import Booking, Membership, OtpCode, User
from ..schemas import OtpSend, OtpVerify, ProfileUpdate
from ..security import hash_code, make_token, new_otp, read_token
from ..timeutil import utcnow

router = APIRouter(prefix="/auth", tags=["auth"])
REFRESH_COOKIE = "turf_refresh"


def session_payload(db: Session, user: User, response: Response, tenant_id: str | None = None) -> dict:
    memberships = db.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    m = next((m for m in memberships if m.tenant_id == tenant_id), memberships[0] if memberships else None)
    refresh = make_token(user.id, "refresh", tenant_id=m.tenant_id if m else None, role=m.role if m else None)
    response.set_cookie(
        REFRESH_COOKIE, refresh, httponly=True, samesite="lax", secure=get_settings().cookie_secure,
        max_age=get_settings().refresh_token_days * 86400, path="/api/v1/auth",
    )
    return {
        "access_token": make_token(user.id, "access", tenant_id=m.tenant_id if m else None, role=m.role if m else None),
        "user": user_out(user),
        "tenant": {"id": m.tenant_id, "name": m.tenant.name, "role": m.role,
                   "kyc_status": m.tenant.kyc_status} if m else None,
        "tenants": [{"id": x.tenant_id, "name": x.tenant.name, "role": x.role} for x in memberships],
    }


def user_out(u: User) -> dict:
    return {"id": u.id, "phone": u.phone, "name": u.name, "email": u.email, "city": u.city,
            "is_platform_admin": u.is_platform_admin}


@router.post("/otp/send")
def send_otp(body: OtpSend, db: Session = Depends(get_db)):
    s = get_settings()
    row = db.get(OtpCode, body.phone)
    if row and row.sent_at > utcnow() - timedelta(seconds=30):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Please wait 30 seconds before asking for a new code")
    code = new_otp()
    if row:
        db.delete(row)
        db.flush()
    db.add(OtpCode(phone=body.phone, code_hash=hash_code(body.phone, code),
                   expires_at=utcnow() + timedelta(minutes=s.otp_ttl_minutes), sent_at=utcnow()))
    db.commit()
    # Production: hand the code to MSG91 / Twilio Verify here.
    return {"sent": True, "dev_code": code if s.otp_dev_mode else None}


@router.post("/otp/verify")
def verify_otp(body: OtpVerify, response: Response, db: Session = Depends(get_db)):
    row = db.get(OtpCode, body.phone)
    if not row or row.expires_at < utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code expired, request a new one")
    if row.attempts >= get_settings().otp_max_attempts:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts, request a new code")
    if row.code_hash != hash_code(body.phone, body.code):
        row.attempts += 1
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wrong code")
    db.delete(row)
    user = db.scalar(select(User).where(User.phone == body.phone))
    if not user:
        user = User(phone=body.phone, name=body.name)
        db.add(user)
    elif body.name and not user.name:
        user.name = body.name
    db.commit()
    return session_payload(db, user, response)


@router.post("/refresh")
def refresh(response: Response, tenant_id: str | None = None, turf_refresh: str | None = Cookie(None),
            db: Session = Depends(get_db)):
    try:
        payload = read_token(turf_refresh or "", "refresh")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please log in") from None
    user = db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please log in")
    return session_payload(db, user, response, tenant_id or payload.get("tid"))


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    return user_out(user)


@router.delete("/me")
def delete_me(response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """DPDP Act: delete-my-account. Booking history stays for the venue's books
    but is detached from the person."""
    user.phone = f"deleted-{user.id[:8]}"
    user.name = user.email = user.city = None
    db.execute(update(Booking).where(Booking.user_id == user.id)
               .values(customer_name="Deleted user", customer_phone=""))
    db.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return {"deleted": True}
