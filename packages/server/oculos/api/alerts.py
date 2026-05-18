"""Alert rules API."""
from fastapi import APIRouter, HTTPException
from oculos.app import get_db
from oculos.models import AlertRule, AlertRuleCreate

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertRule])
async def list_alerts():
    db = get_db()
    return await db.list_alert_rules()


@router.post("", response_model=AlertRule, status_code=201)
async def create_alert(body: AlertRuleCreate):
    db = get_db()
    rule = await db.create_alert_rule(
        name=body.name, type=body.type, agent_id=body.agent_id,
        threshold=body.threshold, webhook_url=body.webhook_url,
    )
    await db.log_audit("alert.create", "alert", rule.id, {"name": body.name, "type": body.type})
    return rule


@router.delete("/{rule_id}", status_code=204)
async def delete_alert(rule_id: str):
    db = get_db()
    deleted = await db.delete_alert_rule(rule_id)
    if not deleted:
        raise HTTPException(404, "Alert rule not found")
