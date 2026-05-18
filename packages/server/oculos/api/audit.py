"""Audit log API."""
from fastapi import APIRouter
from oculos.app import get_db
from oculos.models import AuditEntry

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[AuditEntry])
async def get_audit_log(limit: int = 100):
    db = get_db()
    return await db.get_audit_log(limit=min(limit, 500))
