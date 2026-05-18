"""SQLite database layer for OculOS."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import aiosqlite

from oculos.models import (
    Agent,
    AgentCreate,
    AgentStatus,
    AgentUpdate,
    CostRecord,
    CostSummary,
    TraceEvent,
)

DEFAULT_DB_PATH = Path.home() / ".oculos" / "oculos.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    framework TEXT,
    model TEXT,
    health_url TEXT,
    trace_url TEXT,
    status TEXT DEFAULT 'unknown',
    tags TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    last_seen TEXT,
    registered_at TEXT NOT NULL,
    total_cost REAL DEFAULT 0.0,
    total_invocations INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trace_events (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    data TEXT DEFAULT '{}',
    duration_ms REAL,
    cost REAL,
    tokens_in INTEGER,
    tokens_out INTEGER,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS cost_records (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    trace_id TEXT,
    cost REAL NOT NULL,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    model TEXT,
    provider TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_events_agent ON trace_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON trace_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_ts ON trace_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_cost_records_agent ON cost_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_ts ON cost_records(timestamp);
"""


class Database:
    def __init__(self, db_path: str | Path | None = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self._db: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(str(self.db_path))
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(SCHEMA)
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    @property
    def db(self) -> aiosqlite.Connection:
        if not self._db:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self._db

    # --- Agents ---

    async def create_agent(self, data: AgentCreate) -> Agent:
        agent = Agent(
            name=data.name,
            framework=data.framework,
            model=data.model,
            health_url=data.health_url,
            trace_url=data.trace_url,
            tags=data.tags,
            metadata=data.metadata,
        )
        await self.db.execute(
            """INSERT INTO agents (id, name, framework, model, health_url, trace_url, status, tags, metadata, registered_at, total_cost, total_invocations)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                agent.id,
                agent.name,
                agent.framework,
                agent.model,
                agent.health_url,
                agent.trace_url,
                agent.status.value,
                json.dumps(agent.tags),
                json.dumps(agent.metadata),
                agent.registered_at.isoformat(),
                agent.total_cost,
                agent.total_invocations,
            ),
        )
        await self.db.commit()
        return agent

    async def get_agent(self, agent_id: str) -> Agent | None:
        cursor = await self.db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
        row = await cursor.fetchone()
        if not row:
            return None
        return self._row_to_agent(row)

    async def get_agent_by_name(self, name: str) -> Agent | None:
        cursor = await self.db.execute("SELECT * FROM agents WHERE name = ?", (name,))
        row = await cursor.fetchone()
        if not row:
            return None
        return self._row_to_agent(row)

    async def list_agents(self) -> list[Agent]:
        cursor = await self.db.execute("SELECT * FROM agents ORDER BY registered_at DESC")
        rows = await cursor.fetchall()
        return [self._row_to_agent(row) for row in rows]

    async def update_agent(self, agent_id: str, data: AgentUpdate) -> Agent | None:
        agent = await self.get_agent(agent_id)
        if not agent:
            return None

        updates: list[str] = []
        values: list[Any] = []

        if data.name is not None:
            updates.append("name = ?")
            values.append(data.name)
        if data.framework is not None:
            updates.append("framework = ?")
            values.append(data.framework)
        if data.model is not None:
            updates.append("model = ?")
            values.append(data.model)
        if data.health_url is not None:
            updates.append("health_url = ?")
            values.append(data.health_url)
        if data.trace_url is not None:
            updates.append("trace_url = ?")
            values.append(data.trace_url)
        if data.tags is not None:
            updates.append("tags = ?")
            values.append(json.dumps(data.tags))
        if data.metadata is not None:
            updates.append("metadata = ?")
            values.append(json.dumps(data.metadata))

        if updates:
            values.append(agent_id)
            await self.db.execute(
                f"UPDATE agents SET {', '.join(updates)} WHERE id = ?",
                values,
            )
            await self.db.commit()

        return await self.get_agent(agent_id)

    async def update_agent_status(
        self, agent_id: str, status: AgentStatus, last_seen: datetime | None = None
    ) -> None:
        if last_seen:
            await self.db.execute(
                "UPDATE agents SET status = ?, last_seen = ? WHERE id = ?",
                (status.value, last_seen.isoformat(), agent_id),
            )
        else:
            await self.db.execute(
                "UPDATE agents SET status = ? WHERE id = ?",
                (status.value, agent_id),
            )
        await self.db.commit()

    async def delete_agent(self, agent_id: str) -> bool:
        cursor = await self.db.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        await self.db.commit()
        return cursor.rowcount > 0

    # --- Traces ---

    async def insert_trace_event(self, event: TraceEvent) -> None:
        await self.db.execute(
            """INSERT INTO trace_events (id, agent_id, trace_id, event_type, timestamp, data, duration_ms, cost, tokens_in, tokens_out)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event.id,
                event.agent_id,
                event.trace_id,
                event.event_type.value,
                event.timestamp.isoformat(),
                json.dumps(event.data),
                event.duration_ms,
                event.cost,
                event.tokens_in,
                event.tokens_out,
            ),
        )
        await self.db.commit()

    async def get_trace_events(
        self,
        agent_id: str | None = None,
        trace_id: str | None = None,
        limit: int = 100,
    ) -> list[TraceEvent]:
        conditions: list[str] = []
        values: list[Any] = []

        if agent_id:
            conditions.append("agent_id = ?")
            values.append(agent_id)
        if trace_id:
            conditions.append("trace_id = ?")
            values.append(trace_id)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        values.append(limit)

        cursor = await self.db.execute(
            f"SELECT * FROM trace_events {where} ORDER BY timestamp DESC LIMIT ?",
            values,
        )
        rows = await cursor.fetchall()
        return [self._row_to_trace_event(row) for row in rows]

    # --- Cost ---

    async def insert_cost_record(self, record: CostRecord) -> None:
        await self.db.execute(
            """INSERT INTO cost_records (id, agent_id, trace_id, cost, tokens_in, tokens_out, model, provider, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record.id,
                record.agent_id,
                record.trace_id,
                record.cost,
                record.tokens_in,
                record.tokens_out,
                record.model,
                record.provider,
                record.timestamp.isoformat(),
            ),
        )
        # Update agent totals
        await self.db.execute(
            "UPDATE agents SET total_cost = total_cost + ?, total_invocations = total_invocations + 1 WHERE id = ?",
            (record.cost, record.agent_id),
        )
        await self.db.commit()

    async def get_cost_summary(self, agent_id: str) -> CostSummary | None:
        agent = await self.get_agent(agent_id)
        if not agent:
            return None

        now = datetime.utcnow()
        hour_ago = (now - timedelta(hours=1)).isoformat()
        day_ago = (now - timedelta(hours=24)).isoformat()

        cursor = await self.db.execute(
            "SELECT COALESCE(SUM(cost), 0) FROM cost_records WHERE agent_id = ? AND timestamp > ?",
            (agent_id, hour_ago),
        )
        cost_last_hour = (await cursor.fetchone())[0]

        cursor = await self.db.execute(
            "SELECT COALESCE(SUM(cost), 0) FROM cost_records WHERE agent_id = ? AND timestamp > ?",
            (agent_id, day_ago),
        )
        cost_last_24h = (await cursor.fetchone())[0]

        cursor = await self.db.execute(
            "SELECT COALESCE(SUM(tokens_in), 0), COALESCE(SUM(tokens_out), 0) FROM cost_records WHERE agent_id = ?",
            (agent_id,),
        )
        tokens = await cursor.fetchone()

        return CostSummary(
            agent_id=agent.id,
            agent_name=agent.name,
            total_cost=agent.total_cost,
            total_invocations=agent.total_invocations,
            total_tokens_in=tokens[0],
            total_tokens_out=tokens[1],
            cost_last_hour=cost_last_hour,
            cost_last_24h=cost_last_24h,
        )

    async def get_total_cost(self) -> float:
        cursor = await self.db.execute("SELECT COALESCE(SUM(total_cost), 0) FROM agents")
        row = await cursor.fetchone()
        return row[0]

    async def get_agents_count(self) -> int:
        cursor = await self.db.execute("SELECT COUNT(*) FROM agents")
        row = await cursor.fetchone()
        return row[0]

    # --- Helpers ---

    @staticmethod
    def _row_to_agent(row: sqlite3.Row) -> Agent:
        return Agent(
            id=row["id"],
            name=row["name"],
            framework=row["framework"],
            model=row["model"],
            health_url=row["health_url"],
            trace_url=row["trace_url"],
            status=AgentStatus(row["status"]),
            tags=json.loads(row["tags"]) if row["tags"] else [],
            metadata=json.loads(row["metadata"]) if row["metadata"] else {},
            last_seen=datetime.fromisoformat(row["last_seen"]) if row["last_seen"] else None,
            registered_at=datetime.fromisoformat(row["registered_at"]),
            total_cost=row["total_cost"],
            total_invocations=row["total_invocations"],
        )

    @staticmethod
    def _row_to_trace_event(row: sqlite3.Row) -> TraceEvent:
        from oculos.models import TraceEventType

        return TraceEvent(
            id=row["id"],
            agent_id=row["agent_id"],
            trace_id=row["trace_id"],
            event_type=TraceEventType(row["event_type"]),
            timestamp=datetime.fromisoformat(row["timestamp"]),
            data=json.loads(row["data"]) if row["data"] else {},
            duration_ms=row["duration_ms"],
            cost=row["cost"],
            tokens_in=row["tokens_in"],
            tokens_out=row["tokens_out"],
        )
