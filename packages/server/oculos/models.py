"""Pydantic models for OculOS."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# --- Secrets ---

class Secret(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    key_name: str
    encrypted_value: str
    hint: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    rotated_at: datetime | None = None


class SecretCreate(BaseModel):
    key_name: str
    value: str
    hint: str | None = None


class SecretPublic(BaseModel):
    id: str
    key_name: str
    hint: str | None
    created_at: datetime
    rotated_at: datetime | None


# --- Status ---

class StatusResponse(BaseModel):
    status: str = "ok"
    version: str
    workflows_count: int = 0
    runs_today: int = 0


# ── Workflows ──────────────────────────────────

class WorkflowNode(BaseModel):
    id: str
    type: str
    label: str = ""
    config: dict = {}
    position: dict = {"x": 0, "y": 0}


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str = ""


class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    icon: str = "⚡"
    nodes: list[WorkflowNode] = []
    edges: list[WorkflowEdge] = []
    trigger_type: str = "manual"
    trigger_config: dict = {}
    guardrails: dict = {}


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    nodes: list[WorkflowNode] | None = None
    edges: list[WorkflowEdge] | None = None
    trigger_type: str | None = None
    trigger_config: dict | None = None
    guardrails: dict | None = None
    status: str | None = None


class Workflow(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]
    trigger_type: str
    trigger_config: dict
    guardrails: dict
    status: str
    created_by: str | None
    created_at: str
    updated_at: str


class WorkflowRun(BaseModel):
    id: str
    workflow_id: str
    status: str
    started_at: str
    completed_at: str | None
    total_cost: float
    total_steps: int
    node_results: dict
    error: str | None
    trigger_type: str
