"""OculOS SDK client — register agents, report cost/traces."""

from __future__ import annotations

import uuid
import logging
from contextlib import contextmanager
from datetime import datetime
from typing import Any

import httpx

from oculos_sdk.types import CostRecord, TraceEvent, TraceEventType

logger = logging.getLogger("oculos_sdk")

DEFAULT_SERVER = "http://localhost:9090"


class TaskContext:
    """Context manager for tracking a task with optional budget."""

    def __init__(self, client: Oculos, name: str, budget: str | None = None):
        self.client = client
        self.name = name
        self.budget = budget
        self.trace_id = str(uuid.uuid4())
        self._total_cost = 0.0
        self._started_at = datetime.utcnow()

    def report_cost(self, cost: float, model: str | None = None, provider: str | None = None,
                    tokens_in: int = 0, tokens_out: int = 0) -> None:
        self._total_cost += cost
        self.client.report_cost(
            cost=cost,
            trace_id=self.trace_id,
            model=model,
            provider=provider,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )

    def complete(self, result: Any = None) -> None:
        self.client._send_trace_event(
            trace_id=self.trace_id,
            event_type=TraceEventType.agent_complete,
            data={"task": self.name, "result_preview": str(result)[:200] if result else None},
            cost=self._total_cost,
        )

    def __enter__(self):
        self.client._send_trace_event(
            trace_id=self.trace_id,
            event_type=TraceEventType.agent_start,
            data={"task": self.name, "budget": self.budget},
        )
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.client._send_trace_event(
                trace_id=self.trace_id,
                event_type=TraceEventType.error,
                data={"task": self.name, "error": str(exc_val)},
                cost=self._total_cost,
            )
        return False


class Oculos:
    """OculOS SDK client."""

    def __init__(self, server: str = DEFAULT_SERVER, agent_name: str | None = None):
        self.server = server.rstrip("/")
        self.agent_name = agent_name
        self.agent_id: str | None = None
        self._client = httpx.Client(base_url=self.server, timeout=10)

    def register(
        self,
        name: str | None = None,
        health_url: str | None = None,
        framework: str | None = None,
        model: str | None = None,
        tags: list[str] | None = None,
    ) -> str:
        """Register this agent with the OculOS server. Returns agent ID."""
        agent_name = name or self.agent_name
        if not agent_name:
            raise ValueError("Agent name is required")

        payload: dict[str, Any] = {"name": agent_name}
        if health_url:
            payload["health_url"] = health_url
        if framework:
            payload["framework"] = framework
        if model:
            payload["model"] = model
        if tags:
            payload["tags"] = tags

        try:
            resp = self._client.post("/api/agents", json=payload)
            if resp.status_code == 201:
                data = resp.json()
                self.agent_id = data["id"]
                self.agent_name = agent_name
                logger.info("Registered agent '%s' (id=%s)", agent_name, self.agent_id)
                return self.agent_id
            elif resp.status_code == 409:
                # Already exists, get the ID
                resp = self._client.get(f"/api/agents")
                for agent in resp.json().get("agents", []):
                    if agent["name"] == agent_name:
                        self.agent_id = agent["id"]
                        self.agent_name = agent_name
                        return self.agent_id
                raise RuntimeError(f"Agent '{agent_name}' exists but couldn't retrieve ID")
            else:
                raise RuntimeError(f"Registration failed: {resp.status_code} {resp.text}")
        except httpx.ConnectError:
            logger.warning("OculOS server not reachable at %s — running without monitoring", self.server)
            self.agent_id = str(uuid.uuid4())
            return self.agent_id

    def report_cost(
        self,
        cost: float,
        trace_id: str | None = None,
        model: str | None = None,
        provider: str | None = None,
        tokens_in: int = 0,
        tokens_out: int = 0,
    ) -> None:
        """Report cost for an invocation."""
        if not self.agent_id:
            return

        record = CostRecord(
            agent_id=self.agent_id,
            trace_id=trace_id,
            cost=cost,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            model=model,
            provider=provider,
        )
        try:
            self._client.post("/api/traces/cost", json=record.model_dump(mode="json"))
        except httpx.ConnectError:
            logger.debug("Failed to report cost — server unreachable")

    def task(self, name: str, budget: str | None = None) -> TaskContext:
        """Create a task context for tracking cost and traces."""
        return TaskContext(self, name, budget)

    def _send_trace_event(
        self,
        trace_id: str,
        event_type: TraceEventType,
        data: dict[str, Any] | None = None,
        cost: float | None = None,
        duration_ms: float | None = None,
        tokens_in: int | None = None,
        tokens_out: int | None = None,
    ) -> None:
        if not self.agent_id:
            return

        event = TraceEvent(
            agent_id=self.agent_id,
            trace_id=trace_id,
            event_type=event_type,
            data=data or {},
            cost=cost,
            duration_ms=duration_ms,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )
        try:
            self._client.post("/api/traces", json=event.model_dump(mode="json"))
        except httpx.ConnectError:
            logger.debug("Failed to send trace — server unreachable")

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
