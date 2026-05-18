"""Agent CRUD API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from oculos.app import get_db
from oculos.models import Agent, AgentCreate, AgentListResponse, AgentUpdate, CostSummary

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=AgentListResponse)
async def list_agents():
    db = get_db()
    agents = await db.list_agents()
    return AgentListResponse(agents=agents, total=len(agents))


@router.post("", response_model=Agent, status_code=201)
async def create_agent(data: AgentCreate):
    db = get_db()
    existing = await db.get_agent_by_name(data.name)
    if existing:
        raise HTTPException(status_code=409, detail=f"Agent '{data.name}' already exists")
    return await db.create_agent(data)


@router.get("/{agent_id}", response_model=Agent)
async def get_agent(agent_id: str):
    db = get_db()
    agent = await db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=Agent)
async def update_agent(agent_id: str, data: AgentUpdate):
    db = get_db()
    agent = await db.update_agent(agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str):
    db = get_db()
    deleted = await db.delete_agent(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.get("/{agent_id}/cost", response_model=CostSummary)
async def get_agent_cost(agent_id: str):
    db = get_db()
    summary = await db.get_cost_summary(agent_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Agent not found")
    return summary
