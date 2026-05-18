"""Budget management and enforcement API."""
from fastapi import APIRouter, HTTPException
from oculos.app import get_db
from oculos.models import Budget, BudgetCreate

router = APIRouter(prefix="/api/agents/{agent_id}/budget", tags=["budgets"])


@router.get("", response_model=Budget | None)
async def get_budget(agent_id: str):
    db = get_db()
    return await db.get_budget(agent_id)


@router.put("", response_model=Budget)
async def set_budget(agent_id: str, body: BudgetCreate):
    db = get_db()
    agent = await db.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    budget = await db.upsert_budget(
        agent_id,
        limit_total=body.limit_total,
        limit_per_task=body.limit_per_task,
        limit_per_day=body.limit_per_day,
        alert_at_percent=body.alert_at_percent,
    )
    await db.log_audit("budget.set", "budget", budget.id,
                       {"agent_id": agent_id, "limit_total": body.limit_total})
    return budget


@router.delete("", status_code=204)
async def delete_budget(agent_id: str):
    db = get_db()
    await db.db.execute("DELETE FROM budgets WHERE agent_id = ?", (agent_id,))
    await db.db.commit()


router_all = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router_all.get("", response_model=list[Budget])
async def list_all_budgets():
    db = get_db()
    return await db.list_budgets()
