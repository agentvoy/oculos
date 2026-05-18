"""Trace API routes."""

from __future__ import annotations

from fastapi import APIRouter, Query

from oculos.app import get_db
from oculos.models import CostRecord, TraceEvent

router = APIRouter(prefix="/api/traces", tags=["traces"])


@router.get("", response_model=list[TraceEvent])
async def list_traces(
    agent_id: str | None = Query(None),
    trace_id: str | None = Query(None),
    limit: int = Query(100, le=1000),
):
    db = get_db()
    return await db.get_trace_events(agent_id=agent_id, trace_id=trace_id, limit=limit)


@router.post("", status_code=201)
async def ingest_trace_event(event: TraceEvent):
    db = get_db()
    agent = await db.get_agent(event.agent_id)
    if not agent:
        # Auto-register unknown agents on first trace
        from oculos.models import AgentCreate
        await db.create_agent(AgentCreate(name=f"agent-{event.agent_id[:8]}"))

    await db.insert_trace_event(event)

    # If the event has cost data, record it
    if event.cost and event.cost > 0:
        await db.insert_cost_record(
            CostRecord(
                agent_id=event.agent_id,
                trace_id=event.trace_id,
                cost=event.cost,
                tokens_in=event.tokens_in or 0,
                tokens_out=event.tokens_out or 0,
            )
        )

    return {"status": "ok"}


@router.post("/cost", status_code=201)
async def ingest_cost(record: CostRecord):
    db = get_db()
    await db.insert_cost_record(record)
    return {"status": "ok"}
