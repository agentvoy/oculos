"""Pydantic models for OculOS."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# --- Enums ---

class AgentStatus(str, Enum):
    healthy = "healthy"
    degraded = "degraded"
    offline = "offline"
    unknown = "unknown"


class TraceEventType(str, Enum):
    agent_start = "agent_start"
    llm_call = "llm_call"
    tool_call = "tool_call"
    guard_check = "guard_check"
    pipeline_stage = "pipeline_stage"
    agent_complete = "agent_complete"
    error = "error"


# --- Agent ---

class AgentCreate(BaseModel):
    name: str
    framework: str | None = None
    model: str | None = None
    health_url: str | None = None
    trace_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    name: str | None = None
    framework: str | None = None
    model: str | None = None
    health_url: str | None = None
    trace_url: str | None = None
    tags: list[str] | None = None
    metadata: dict[str, Any] | None = None


class Agent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    framework: str | None = None
    model: str | None = None
    health_url: str | None = None
    trace_url: str | None = None
    status: AgentStatus = AgentStatus.unknown
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    last_seen: datetime | None = None
    registered_at: datetime = Field(default_factory=datetime.utcnow)
    total_cost: float = 0.0
    total_invocations: int = 0


# --- Traces ---

class TraceEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    trace_id: str
    event_type: TraceEventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: dict[str, Any] = Field(default_factory=dict)
    duration_ms: float | None = None
    cost: float | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None


class TraceSession(BaseModel):
    trace_id: str
    agent_id: str
    started_at: datetime
    ended_at: datetime | None = None
    total_cost: float = 0.0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    events: list[TraceEvent] = Field(default_factory=list)


# --- Cost ---

class CostRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    trace_id: str | None = None
    cost: float
    tokens_in: int = 0
    tokens_out: int = 0
    model: str | None = None
    provider: str | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class CostSummary(BaseModel):
    agent_id: str
    agent_name: str
    total_cost: float = 0.0
    total_invocations: int = 0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    cost_last_hour: float = 0.0
    cost_last_24h: float = 0.0


# --- API responses ---

class AgentListResponse(BaseModel):
    agents: list[Agent]
    total: int


class StatusResponse(BaseModel):
    status: str = "ok"
    version: str
    agents_count: int = 0
    total_cost: float = 0.0
