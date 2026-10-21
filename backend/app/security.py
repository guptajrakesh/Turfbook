import hashlib
import hmac
import secrets
from datetime import timedelta

import jwt

from .config import get_settings
from .timeutil import utcnow


def hash_code(phone: str, code: str) -> str:
    key = get_settings().jwt_secret.encode()
    return hmac.new(key, f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def new_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def make_token(user_id: str, kind: str, *, tenant_id: str | None = None, role: str | None = None) -> str:
    s = get_settings()
    ttl = timedelta(minutes=s.access_token_minutes) if kind == "access" else timedelta(days=s.refresh_token_days)
    now = utcnow()
    payload = {"sub": user_id, "typ": kind, "iat": now, "exp": now + ttl, "jti": secrets.token_hex(8)}
    if tenant_id:
        payload["tid"] = tenant_id
        payload["role"] = role
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def read_token(token: str, kind: str) -> dict:
    payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    if payload.get("typ") != kind:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def razorpay_signature(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_razorpay_signature(body: bytes, signature: str, secret: str) -> bool:
    return hmac.compare_digest(razorpay_signature(body, secret), signature or "")
