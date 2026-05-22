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
    PromptVersion,
    Secret,
    Budget,
    AlertRule,
    AuditEntry,
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

CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);
CREATE INDEX IF NOT EXISTS idx_prompts_agent ON prompts(agent_id);

CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    key_name TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    hint TEXT,
    created_at TEXT NOT NULL,
    rotated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_secrets_agent ON secrets(agent_id);

CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL UNIQUE,
    limit_total REAL,
    limit_per_task REAL,
    limit_per_day REAL,
    alert_at_percent REAL DEFAULT 80.0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    agent_id TEXT,
    threshold REAL,
    webhook_url TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    last_triggered TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT,
    UNIQUE(provider, provider_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used TEXT,
    expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '⚡',
    nodes TEXT NOT NULL DEFAULT '[]',
    edges TEXT NOT NULL DEFAULT '[]',
    trigger_type TEXT NOT NULL DEFAULT 'manual',
    trigger_config TEXT NOT NULL DEFAULT '{}',
    guardrails TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'inactive',
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    total_cost REAL NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL DEFAULT 0,
    node_results TEXT NOT NULL DEFAULT '{}',
    error TEXT,
    trigger_type TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started ON workflow_runs(started_at);
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

    # --- Prompts ---

    async def upsert_prompt(self, agent_id: str, name: str, content: str) -> PromptVersion:
        # Deactivate previous versions
        await self.db.execute(
            "UPDATE prompts SET is_active = 0 WHERE agent_id = ? AND name = ?",
            (agent_id, name),
        )
        cursor = await self.db.execute(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM prompts WHERE agent_id = ? AND name = ?",
            (agent_id, name),
        )
        version = (await cursor.fetchone())[0]
        p = PromptVersion(agent_id=agent_id, name=name, content=content, version=version)
        await self.db.execute(
            "INSERT INTO prompts (id, agent_id, name, content, version, is_active, created_at) VALUES (?,?,?,?,?,1,?)",
            (p.id, p.agent_id, p.name, p.content, p.version, p.created_at.isoformat()),
        )
        await self.db.commit()
        return p

    async def list_prompts(self, agent_id: str) -> list[PromptVersion]:
        cursor = await self.db.execute(
            "SELECT * FROM prompts WHERE agent_id = ? ORDER BY name, version DESC",
            (agent_id,),
        )
        rows = await cursor.fetchall()
        return [PromptVersion(id=r["id"], agent_id=r["agent_id"], name=r["name"],
                              content=r["content"], version=r["version"],
                              is_active=bool(r["is_active"]),
                              created_at=datetime.fromisoformat(r["created_at"])) for r in rows]

    async def get_active_prompt(self, agent_id: str, name: str) -> PromptVersion | None:
        cursor = await self.db.execute(
            "SELECT * FROM prompts WHERE agent_id = ? AND name = ? AND is_active = 1",
            (agent_id, name),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return PromptVersion(id=row["id"], agent_id=row["agent_id"], name=row["name"],
                             content=row["content"], version=row["version"],
                             is_active=True, created_at=datetime.fromisoformat(row["created_at"]))

    async def rollback_prompt(self, prompt_id: str) -> PromptVersion | None:
        cursor = await self.db.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,))
        row = await cursor.fetchone()
        if not row:
            return None
        await self.db.execute(
            "UPDATE prompts SET is_active = 0 WHERE agent_id = ? AND name = ?",
            (row["agent_id"], row["name"]),
        )
        await self.db.execute("UPDATE prompts SET is_active = 1 WHERE id = ?", (prompt_id,))
        await self.db.commit()
        return await self.get_active_prompt(row["agent_id"], row["name"])

    async def delete_prompt(self, prompt_id: str) -> bool:
        cursor = await self.db.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,))
        await self.db.commit()
        return cursor.rowcount > 0

    # --- Secrets ---

    async def create_secret(self, agent_id: str | None, key_name: str,
                             encrypted_value: str, hint: str | None = None) -> Secret:
        s = Secret(agent_id=agent_id, key_name=key_name,
                   encrypted_value=encrypted_value, hint=hint)
        await self.db.execute(
            "INSERT INTO secrets (id, agent_id, key_name, encrypted_value, hint, created_at) VALUES (?,?,?,?,?,?)",
            (s.id, s.agent_id, s.key_name, s.encrypted_value, s.hint, s.created_at.isoformat()),
        )
        await self.db.commit()
        return s

    async def list_secrets(self, agent_id: str | None = None) -> list[Secret]:
        if agent_id:
            cursor = await self.db.execute(
                "SELECT * FROM secrets WHERE agent_id = ? OR agent_id IS NULL ORDER BY created_at DESC",
                (agent_id,),
            )
        else:
            cursor = await self.db.execute("SELECT * FROM secrets ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [Secret(id=r["id"], agent_id=r["agent_id"], key_name=r["key_name"],
                       encrypted_value=r["encrypted_value"], hint=r["hint"],
                       created_at=datetime.fromisoformat(r["created_at"]),
                       rotated_at=datetime.fromisoformat(r["rotated_at"]) if r["rotated_at"] else None)
                for r in rows]

    async def rotate_secret(self, secret_id: str, new_encrypted_value: str) -> Secret | None:
        now = datetime.utcnow().isoformat()
        await self.db.execute(
            "UPDATE secrets SET encrypted_value = ?, rotated_at = ? WHERE id = ?",
            (new_encrypted_value, now, secret_id),
        )
        await self.db.commit()
        cursor = await self.db.execute("SELECT * FROM secrets WHERE id = ?", (secret_id,))
        row = await cursor.fetchone()
        if not row:
            return None
        return Secret(id=row["id"], agent_id=row["agent_id"], key_name=row["key_name"],
                      encrypted_value=row["encrypted_value"], hint=row["hint"],
                      created_at=datetime.fromisoformat(row["created_at"]),
                      rotated_at=datetime.fromisoformat(row["rotated_at"]) if row["rotated_at"] else None)

    async def delete_secret(self, secret_id: str) -> bool:
        cursor = await self.db.execute("DELETE FROM secrets WHERE id = ?", (secret_id,))
        await self.db.commit()
        return cursor.rowcount > 0

    # --- Budgets ---

    async def upsert_budget(self, agent_id: str, limit_total: float | None = None,
                             limit_per_task: float | None = None, limit_per_day: float | None = None,
                             alert_at_percent: float = 80.0) -> Budget:
        cursor = await self.db.execute("SELECT id FROM budgets WHERE agent_id = ?", (agent_id,))
        existing = await cursor.fetchone()
        b = Budget(agent_id=agent_id, limit_total=limit_total, limit_per_task=limit_per_task,
                   limit_per_day=limit_per_day, alert_at_percent=alert_at_percent)
        if existing:
            await self.db.execute(
                """UPDATE budgets SET limit_total=?, limit_per_task=?, limit_per_day=?, alert_at_percent=?
                   WHERE agent_id=?""",
                (limit_total, limit_per_task, limit_per_day, alert_at_percent, agent_id),
            )
        else:
            await self.db.execute(
                "INSERT INTO budgets (id, agent_id, limit_total, limit_per_task, limit_per_day, alert_at_percent, created_at) VALUES (?,?,?,?,?,?,?)",
                (b.id, b.agent_id, b.limit_total, b.limit_per_task, b.limit_per_day, b.alert_at_percent, b.created_at.isoformat()),
            )
        await self.db.commit()
        return b

    async def get_budget(self, agent_id: str) -> Budget | None:
        cursor = await self.db.execute("SELECT * FROM budgets WHERE agent_id = ?", (agent_id,))
        row = await cursor.fetchone()
        if not row:
            return None
        return Budget(id=row["id"], agent_id=row["agent_id"], limit_total=row["limit_total"],
                      limit_per_task=row["limit_per_task"], limit_per_day=row["limit_per_day"],
                      alert_at_percent=row["alert_at_percent"],
                      created_at=datetime.fromisoformat(row["created_at"]))

    async def list_budgets(self) -> list[Budget]:
        cursor = await self.db.execute("SELECT * FROM budgets ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [Budget(id=r["id"], agent_id=r["agent_id"], limit_total=r["limit_total"],
                       limit_per_task=r["limit_per_task"], limit_per_day=r["limit_per_day"],
                       alert_at_percent=r["alert_at_percent"],
                       created_at=datetime.fromisoformat(r["created_at"])) for r in rows]

    # --- Alert Rules ---

    async def create_alert_rule(self, name: str, type: str, agent_id: str | None = None,
                                 threshold: float | None = None, webhook_url: str | None = None) -> AlertRule:
        a = AlertRule(name=name, type=type, agent_id=agent_id, threshold=threshold, webhook_url=webhook_url)
        await self.db.execute(
            "INSERT INTO alert_rules (id, name, type, agent_id, threshold, webhook_url, enabled, created_at) VALUES (?,?,?,?,?,?,1,?)",
            (a.id, a.name, a.type, a.agent_id, a.threshold, a.webhook_url, a.created_at.isoformat()),
        )
        await self.db.commit()
        return a

    async def list_alert_rules(self) -> list[AlertRule]:
        cursor = await self.db.execute("SELECT * FROM alert_rules ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [AlertRule(id=r["id"], name=r["name"], type=r["type"], agent_id=r["agent_id"],
                          threshold=r["threshold"], webhook_url=r["webhook_url"],
                          enabled=bool(r["enabled"]), created_at=datetime.fromisoformat(r["created_at"]),
                          last_triggered=datetime.fromisoformat(r["last_triggered"]) if r["last_triggered"] else None)
                for r in rows]

    async def delete_alert_rule(self, rule_id: str) -> bool:
        cursor = await self.db.execute("DELETE FROM alert_rules WHERE id = ?", (rule_id,))
        await self.db.commit()
        return cursor.rowcount > 0

    # --- Audit Log ---

    async def log_audit(self, action: str, resource_type: str,
                        resource_id: str | None = None, details: dict | None = None) -> None:
        entry = AuditEntry(action=action, resource_type=resource_type,
                           resource_id=resource_id, details=details or {})
        await self.db.execute(
            "INSERT INTO audit_log (id, timestamp, action, resource_type, resource_id, details) VALUES (?,?,?,?,?,?)",
            (entry.id, entry.timestamp.isoformat(), entry.action, entry.resource_type,
             entry.resource_id, json.dumps(entry.details)),
        )
        await self.db.commit()

    async def get_audit_log(self, limit: int = 100) -> list[AuditEntry]:
        cursor = await self.db.execute(
            "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        return [AuditEntry(id=r["id"], timestamp=datetime.fromisoformat(r["timestamp"]),
                           action=r["action"], resource_type=r["resource_type"],
                           resource_id=r["resource_id"],
                           details=json.loads(r["details"]) if r["details"] else {})
                for r in rows]

    # --- Topology ---

    async def get_topology(self) -> dict:
        """Derive agent graph from shared trace IDs."""
        agents = await self.list_agents()
        # Find agents that share trace IDs (same pipeline)
        cursor = await self.db.execute(
            """SELECT trace_id, GROUP_CONCAT(DISTINCT agent_id) as agent_ids
               FROM trace_events
               GROUP BY trace_id
               HAVING COUNT(DISTINCT agent_id) > 1"""
        )
        rows = await cursor.fetchall()
        edges: set[tuple[str, str]] = set()
        for row in rows:
            ids = row["agent_ids"].split(",")
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    edge = tuple(sorted([ids[i], ids[j]]))
                    edges.add(edge)  # type: ignore
        return {
            "nodes": [{"id": a.id, "name": a.name, "status": a.status.value,
                        "total_cost": a.total_cost, "total_invocations": a.total_invocations,
                        "model": a.model, "framework": a.framework}
                       for a in agents],
            "edges": [{"source": e[0], "target": e[1]} for e in edges],
        }

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

    # --- Workflows ---

    def _parse_workflow_row(self, row) -> dict:
        r = dict(row)
        r["nodes"] = json.loads(r["nodes"])
        r["edges"] = json.loads(r["edges"])
        r["trigger_config"] = json.loads(r["trigger_config"])
        r["guardrails"] = json.loads(r["guardrails"])
        return r

    async def create_workflow(self, data: dict) -> dict:
        import uuid as _uuid
        wf_id = str(_uuid.uuid4())
        cursor = await self.db.execute(
            """INSERT INTO workflows (id, name, description, icon, nodes, edges,
               trigger_type, trigger_config, guardrails, status, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *""",
            (wf_id, data["name"], data.get("description", ""), data.get("icon", "⚡"),
             json.dumps(data.get("nodes", [])), json.dumps(data.get("edges", [])),
             data.get("trigger_type", "manual"), json.dumps(data.get("trigger_config", {})),
             json.dumps(data.get("guardrails", {})), data.get("status", "inactive"),
             data.get("created_by")),
        )
        row = await cursor.fetchone()
        await self.db.commit()
        return self._parse_workflow_row(row)

    async def get_workflow(self, wf_id: str) -> dict | None:
        cursor = await self.db.execute("SELECT * FROM workflows WHERE id = ?", (wf_id,))
        row = await cursor.fetchone()
        return self._parse_workflow_row(row) if row else None

    async def list_workflows(self) -> list[dict]:
        cursor = await self.db.execute("SELECT * FROM workflows ORDER BY updated_at DESC")
        return [self._parse_workflow_row(r) for r in await cursor.fetchall()]

    async def update_workflow(self, wf_id: str, data: dict) -> dict | None:
        fields, values = [], []
        for key in ("name", "description", "icon", "trigger_type", "status"):
            if key in data and data[key] is not None:
                fields.append(f"{key} = ?")
                values.append(data[key])
        for key in ("nodes", "edges", "trigger_config", "guardrails"):
            if key in data and data[key] is not None:
                fields.append(f"{key} = ?")
                values.append(json.dumps(data[key]))
        if not fields:
            return await self.get_workflow(wf_id)
        fields.append("updated_at = datetime('now')")
        values.append(wf_id)
        await self.db.execute(
            f"UPDATE workflows SET {', '.join(fields)} WHERE id = ?", values
        )
        await self.db.commit()
        return await self.get_workflow(wf_id)

    async def delete_workflow(self, wf_id: str) -> bool:
        cur = await self.db.execute("DELETE FROM workflows WHERE id = ?", (wf_id,))
        await self.db.commit()
        return cur.rowcount > 0

    # --- Workflow Runs ---

    def _parse_run_row(self, row) -> dict:
        r = dict(row)
        r["node_results"] = json.loads(r["node_results"])
        return r

    async def create_workflow_run(self, workflow_id: str, trigger_type: str = "manual") -> dict:
        import uuid as _uuid
        run_id = str(_uuid.uuid4())
        cursor = await self.db.execute(
            "INSERT INTO workflow_runs (id, workflow_id, trigger_type) VALUES (?, ?, ?) RETURNING *",
            (run_id, workflow_id, trigger_type),
        )
        row = await cursor.fetchone()
        await self.db.commit()
        return self._parse_run_row(row)

    async def update_workflow_run(self, run_id: str, **kwargs) -> dict | None:
        fields, values = [], []
        for key in ("status", "completed_at", "total_cost", "total_steps", "error"):
            if key in kwargs:
                fields.append(f"{key} = ?")
                values.append(kwargs[key])
        if "node_results" in kwargs:
            fields.append("node_results = ?")
            values.append(json.dumps(kwargs["node_results"]))
        if not fields:
            return None
        values.append(run_id)
        await self.db.execute(
            f"UPDATE workflow_runs SET {', '.join(fields)} WHERE id = ?", values
        )
        await self.db.commit()
        cursor = await self.db.execute("SELECT * FROM workflow_runs WHERE id = ?", (run_id,))
        row = await cursor.fetchone()
        return self._parse_run_row(row) if row else None

    async def list_workflow_runs(self, workflow_id: str | None = None, limit: int = 50) -> list[dict]:
        if workflow_id:
            sql = "SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?"
            params = (workflow_id, limit)
        else:
            sql = "SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT ?"
            params = (limit,)
        cursor = await self.db.execute(sql, params)
        return [self._parse_run_row(r) for r in await cursor.fetchall()]

    # --- Users ---

    async def upsert_user(self, provider: str, provider_id: str, email: str | None,
                          name: str | None, avatar_url: str | None) -> dict:
        import uuid as _uuid
        user_id = str(_uuid.uuid4())
        cursor = await self.db.execute(
            """INSERT INTO users (id, provider, provider_id, email, name, avatar_url, last_login)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(provider, provider_id) DO UPDATE SET
                 email=excluded.email, name=excluded.name, avatar_url=excluded.avatar_url,
                 last_login=datetime('now')
               RETURNING *""",
            (user_id, provider, provider_id, email, name, avatar_url),
        )
        row = await cursor.fetchone()
        await self.db.commit()
        return dict(row)

    async def get_user(self, user_id: str) -> dict | None:
        cursor = await self.db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def list_users(self) -> list[dict]:
        cursor = await self.db.execute("SELECT * FROM users ORDER BY created_at DESC")
        return [dict(r) for r in await cursor.fetchall()]

    # --- Sessions ---

    async def create_session(self, user_id: str, token_hash: str, expires_at: str) -> dict:
        import uuid as _uuid
        sid = str(_uuid.uuid4())
        cursor = await self.db.execute(
            "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?) RETURNING *",
            (sid, user_id, token_hash, expires_at),
        )
        row = await cursor.fetchone()
        await self.db.commit()
        return dict(row)

    async def get_session_by_token_hash(self, token_hash: str) -> dict | None:
        cursor = await self.db.execute(
            "SELECT s.*, u.email, u.name, u.avatar_url, u.role, u.provider "
            "FROM sessions s JOIN users u ON s.user_id = u.id "
            "WHERE s.token_hash = ? AND s.expires_at > datetime('now')",
            (token_hash,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def delete_session(self, session_id: str) -> None:
        await self.db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await self.db.commit()

    async def cleanup_expired_sessions(self) -> None:
        await self.db.execute("DELETE FROM sessions WHERE expires_at < datetime('now')")
        await self.db.commit()

    # --- API Keys ---

    async def create_api_key(self, user_id: str, name: str, key_prefix: str,
                             key_hash: str, expires_at: str | None = None) -> dict:
        import uuid as _uuid
        kid = str(_uuid.uuid4())
        cursor = await self.db.execute(
            "INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
            (kid, user_id, name, key_prefix, key_hash, expires_at),
        )
        row = await cursor.fetchone()
        await self.db.commit()
        return dict(row)

    async def get_api_key_by_hash(self, key_hash: str) -> dict | None:
        cursor = await self.db.execute(
            "SELECT k.*, u.role FROM api_keys k JOIN users u ON k.user_id = u.id "
            "WHERE k.key_hash = ? AND (k.expires_at IS NULL OR k.expires_at > datetime('now'))",
            (key_hash,),
        )
        row = await cursor.fetchone()
        if row:
            await self.db.execute(
                "UPDATE api_keys SET last_used = datetime('now') WHERE id = ?", (dict(row)["id"],),
            )
            await self.db.commit()
        return dict(row) if row else None

    async def list_api_keys(self, user_id: str) -> list[dict]:
        cursor = await self.db.execute(
            "SELECT id, name, key_prefix, created_at, last_used, expires_at "
            "FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]

    async def delete_api_key(self, key_id: str) -> bool:
        cur = await self.db.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
        await self.db.commit()
        return cur.rowcount > 0

    # --- Helpers ---

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
