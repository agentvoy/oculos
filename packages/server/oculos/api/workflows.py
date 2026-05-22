"""
Workflow CRUD & run management.

  GET    /api/workflows                 → list all workflows
  POST   /api/workflows                 → create workflow
  GET    /api/workflows/runs/recent     → recent runs across all workflows
  GET    /api/workflows/{id}            → get workflow
  PATCH  /api/workflows/{id}            → update workflow
  DELETE /api/workflows/{id}            → delete workflow
  POST   /api/workflows/{id}/run        → trigger a manual run
  GET    /api/workflows/{id}/runs       → list runs for workflow
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from oculos.app import get_db

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("")
async def list_workflows():
    db = get_db()
    return await db.list_workflows()


@router.post("", status_code=201)
async def create_workflow(request: Request):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "name is required")
    db = get_db()
    user = getattr(request.state, "user", None)
    body["created_by"] = (user.get("user_id") or user.get("id")) if user else None
    wf = await db.create_workflow(body)
    await db.log_audit("create", "workflow", wf["id"], {"name": wf["name"]})
    return wf


@router.get("/runs/recent")
async def recent_runs():
    db = get_db()
    return await db.list_workflow_runs(limit=50)


@router.get("/{wf_id}")
async def get_workflow(wf_id: str):
    db = get_db()
    wf = await db.get_workflow(wf_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return wf


@router.patch("/{wf_id}")
async def update_workflow(wf_id: str, request: Request):
    body = await request.json()
    db = get_db()
    wf = await db.update_workflow(wf_id, body)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    await db.log_audit("update", "workflow", wf_id, {"fields": list(body.keys())})
    return wf


@router.delete("/{wf_id}", status_code=204)
async def delete_workflow(wf_id: str):
    db = get_db()
    deleted = await db.delete_workflow(wf_id)
    if not deleted:
        raise HTTPException(404, "Workflow not found")
    await db.log_audit("delete", "workflow", wf_id)


@router.post("/{wf_id}/run")
async def run_workflow(wf_id: str):
    db = get_db()
    wf = await db.get_workflow(wf_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    run = await db.create_workflow_run(wf_id, trigger_type="manual")
    # TODO: Phase 5B — execute the workflow via the engine
    return run


@router.get("/{wf_id}/runs")
async def list_runs(wf_id: str):
    db = get_db()
    return await db.list_workflow_runs(workflow_id=wf_id)
