"""
Settings & API key management.

  GET    /api/settings          → server info, auth status
  GET    /api/settings/keys     → list current user's API keys
  POST   /api/settings/keys     → create a new API key (returns raw key ONCE)
  DELETE /api/settings/keys/{id} → revoke an API key
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Request, HTTPException

from oculos import __version__
from oculos.app import get_db
from oculos.auth import auth_enabled, hash_token

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings(request: Request):
    db = get_db()
    agents_count = await db.get_agents_count()
    total_cost = await db.get_total_cost()
    user = getattr(request.state, "user", None)

    return {
        "auth_enabled": auth_enabled(),
        "user": {
            "id": user.get("user_id") or user.get("id"),
            "email": user.get("email"),
            "name": user.get("name"),
            "role": user.get("role"),
            "provider": user.get("provider"),
        } if user else None,
        "server": {
            "version": __version__,
            "agents_count": agents_count,
            "total_cost": total_cost,
        },
    }


@router.get("/keys")
async def list_keys(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        return []
    db = get_db()
    user_id = user.get("user_id") or user.get("id")
    return await db.list_api_keys(user_id)


@router.post("/keys", status_code=201)
async def create_key(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(400, "Auth must be enabled to create API keys")
    body = await request.json()
    name = body.get("name", "Untitled key")

    raw_key = "ocu_" + secrets.token_urlsafe(32)
    key_prefix = raw_key[:12] + "..."
    key_hash = hash_token(raw_key)

    db = get_db()
    user_id = user.get("user_id") or user.get("id")
    record = await db.create_api_key(user_id, name, key_prefix, key_hash)
    await db.log_audit("create", "api_key", record["id"], {"name": name})

    return {**record, "raw_key": raw_key}


@router.delete("/keys/{key_id}", status_code=204)
async def revoke_key(key_id: str):
    db = get_db()
    deleted = await db.delete_api_key(key_id)
    if not deleted:
        raise HTTPException(404, "API key not found")
    await db.log_audit("delete", "api_key", key_id)
