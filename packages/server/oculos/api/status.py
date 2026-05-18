"""Status and health API routes."""

from __future__ import annotations

from fastapi import APIRouter

from oculos import __version__
from oculos.app import get_db
from oculos.models import CostSummary, StatusResponse

router = APIRouter(tags=["status"])


@router.get("/api/status", response_model=StatusResponse)
async def status():
    db = get_db()
    agents_count = await db.get_agents_count()
    total_cost = await db.get_total_cost()
    return StatusResponse(
        version=__version__,
        agents_count=agents_count,
        total_cost=total_cost,
    )


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/api/cost/summary", response_model=list[CostSummary])
async def cost_summary():
    db = get_db()
    agents = await db.list_agents()
    summaries = []
    for agent in agents:
        s = await db.get_cost_summary(agent.id)
        if s:
            summaries.append(s)
    return summaries
