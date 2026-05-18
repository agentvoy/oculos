"""Shared types for OculOS SDK."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TraceEventType(str, Enum):
    agent_start = "agent_start"
    llm_call = "llm_call"
    tool_call = "tool_call"
    guard_check = "guard_check"
    pipeline_stage = "pipeline_stage"
    agent_complete = "agent_complete"
    error = "error"


class TraceEvent(BaseModel):
    agent_id: str
    trace_id: str
    event_type: TraceEventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: dict[str, Any] = Field(default_factory=dict)
    duration_ms: float | None = None
    cost: float | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None


class CostRecord(BaseModel):
    agent_id: str
    trace_id: str | None = None
    cost: float
    tokens_in: int = 0
    tokens_out: int = 0
    model: str | None = None
    provider: str | None = None
