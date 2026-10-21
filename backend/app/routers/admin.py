from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..booking_service import DEFAULT_POLICY
from ..db import get_db
from ..deps import require_admin
from ..models import Booking, CancellationPolicy, Location, Membership, Plan, PlatformFeeLedger, Tenant, User
from ..schemas import PlanIn, TenantIn, TenantPatch

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _plan_out(p: Plan) -> dict:
    return {"id": p.id, "name": p.name, "fixed_fee": p.fixed_fee, "per_booking_fee": p.per_booking_fee,
            "billing_period": p.billing_period}


@router.get("/plans")
def plans(db: Session = Depends(get_db)):
    return [_plan_out(p) for p in db.scalars(select(Plan).order_by(Plan.name))]


@router.post("/plans", status_code=201)
def create_plan(body: PlanIn, db: Session = Depends(get_db)):
    p = Plan(**body.model_dump())
    db.add(p)
    db.commit()
    return _plan_out(p)


@router.get("/tenants")
def tenants(db: Session = Depends(get_db)):
    out = []
    for t in db.scalars(select(Tenant).order_by(Tenant.created_at.desc())):
        out.append({
            "id": t.id, "name": t.name, "status": t.status, "kyc_status": t.kyc_status, "gstin": t.gstin,
            "plan": t.plan.name if t.plan else None,
            "locations": db.scalar(select(func.count()).where(Location.tenant_id == t.id)),
            "bookings": db.scalar(select(func.count()).where(Booking.tenant_id == t.id,
                                                             Booking.status.in_(("confirmed", "completed")))),
            "fees_due": db.scalar(select(func.coalesce(func.sum(PlatformFeeLedger.amount), 0)).where(
                PlatformFeeLedger.tenant_id == t.id, PlatformFeeLedger.reversed.is_(False))),
        })
    return out


@router.post("/tenants", status_code=201)
def create_tenant(body: TenantIn, db: Session = Depends(get_db)):
    t = Tenant(name=body.name, plan_id=body.plan_id, gstin=body.gstin)
    db.add(t)
    user = db.scalar(select(User).where(User.phone == body.owner_phone))
    if not user:
        user = User(phone=body.owner_phone)
        db.add(user)
    db.flush()
    db.add(Membership(user_id=user.id, tenant_id=t.id, role="owner", location_ids=[]))
    db.add_all(CancellationPolicy(tenant_id=t.id, hours_before=h, refund_percent=p) for h, p in DEFAULT_POLICY)
    db.commit()
    return {"id": t.id, "name": t.name}


@router.patch("/tenants/{tenant_id}")
def patch_tenant(tenant_id: str, body: TenantPatch, db: Session = Depends(get_db)):
    t = db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(404, "Tenant not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    return {"id": t.id, "status": t.status, "kyc_status": t.kyc_status, "plan_id": t.plan_id}
