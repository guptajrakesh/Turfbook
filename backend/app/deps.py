from dataclasses import dataclass, field

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Location, Membership, User
from .security import read_token

ROLE_RANK = {"staff": 1, "manager": 2, "owner": 3}


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
    return authorization.split(" ", 1)[1]


def current_user(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> User:
    try:
        payload = read_token(_bearer(authorization), "access")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please log in again") from None
    user = db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return user


def optional_user(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> User | None:
    if not authorization:
        return None
    return current_user(authorization, db)


@dataclass
class TenantCtx:
    user: User
    tenant_id: str
    role: str
    location_ids: list[str] = field(default_factory=list)  # empty = every location

    def can_access(self, location_id: str) -> bool:
        return not self.location_ids or location_id in self.location_ids

    def check_location(self, location: Location | None) -> Location:
        """Tenant isolation: a row from another tenant is reported as missing."""
        if not location or location.tenant_id != self.tenant_id or not self.can_access(location.id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
        return location


def require_role(min_role: str):
    """Single authorisation dependency: resolves the tenant from the token and
    checks the caller's role (owner > manager > staff) on every owner endpoint."""

    def dep(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> TenantCtx:
        user = current_user(authorization, db)
        payload = read_token(_bearer(authorization), "access")
        tenant_id = payload.get("tid")
        if not tenant_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No venue business on this account")
        m = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.tenant_id == tenant_id))
        if not m or m.tenant.status != "active":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this venue business")
        if ROLE_RANK[m.role] < ROLE_RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {min_role} role")
        return TenantCtx(user, tenant_id, m.role, list(m.location_ids or []))

    return dep


def require_admin(user: User = Depends(current_user)) -> User:
    if not user.is_platform_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform admin only")
    return user
