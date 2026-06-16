"""Status and health API routes."""

from __future__ import annotations

from fastapi import APIRouter

from oculos import __version__
from oculos.app import get_db
from oculos.models import StatusResponse

router = APIRouter(tags=["status"])


@router.get("/api/status", response_model=StatusResponse)
async def status():
    db = get_db()
    workflows_count = await db.get_workflows_count()
    runs_today = await db.get_runs_today_count()
    return StatusResponse(
        version=__version__,
        workflows_count=workflows_count,
        runs_today=runs_today,
    )


@router.get("/health")
async def health():
    return {"status": "ok"}
