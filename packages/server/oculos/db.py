"""SQLite database layer for OculOS."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path

import aiosqlite

from oculos.models import Secret

DEFAULT_DB_PATH = Path.home() / ".oculos" / "oculos.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    key_name TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    hint TEXT,
    created_at TEXT NOT NULL,
    rotated_at TEXT
);

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

CREATE TABLE IF NOT EXISTS server_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
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

    # --- Secrets ---

    async def create_secret(self, key_name: str, encrypted_value: str,
                             hint: str | None = None) -> Secret:
        s = Secret(key_name=key_name, encrypted_value=encrypted_value, hint=hint)
        await self.db.execute(
            "INSERT INTO secrets (id, key_name, encrypted_value, hint, created_at) VALUES (?,?,?,?,?)",
            (s.id, s.key_name, s.encrypted_value, s.hint, s.created_at.isoformat()),
        )
        await self.db.commit()
        return s

    async def list_secrets(self) -> list[Secret]:
        cursor = await self.db.execute("SELECT * FROM secrets ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [Secret(id=r["id"], key_name=r["key_name"],
                       encrypted_value=r["encrypted_value"], hint=r["hint"],
                       created_at=datetime.fromisoformat(r["created_at"]),
                       rotated_at=datetime.fromisoformat(r["rotated_at"]) if r["rotated_at"] else None)
                for r in rows]

    async def get_secret(self, secret_id: str) -> Secret | None:
        cursor = await self.db.execute("SELECT * FROM secrets WHERE id = ?", (secret_id,))
        row = await cursor.fetchone()
        if not row:
            return None
        return Secret(id=row["id"], key_name=row["key_name"],
                      encrypted_value=row["encrypted_value"], hint=row["hint"],
                      created_at=datetime.fromisoformat(row["created_at"]),
                      rotated_at=datetime.fromisoformat(row["rotated_at"]) if row["rotated_at"] else None)

    async def rotate_secret(self, secret_id: str, new_encrypted_value: str) -> Secret | None:
        now = datetime.utcnow().isoformat()
        await self.db.execute(
            "UPDATE secrets SET encrypted_value = ?, rotated_at = ? WHERE id = ?",
            (new_encrypted_value, now, secret_id),
        )
        await self.db.commit()
        return await self.get_secret(secret_id)

    async def delete_secret(self, secret_id: str) -> bool:
        cursor = await self.db.execute("DELETE FROM secrets WHERE id = ?", (secret_id,))
        await self.db.commit()
        return cursor.rowcount > 0

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

    async def get_workflows_count(self) -> int:
        cursor = await self.db.execute("SELECT COUNT(*) FROM workflows")
        row = await cursor.fetchone()
        return row[0]

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

    async def get_runs_today_count(self) -> int:
        cursor = await self.db.execute(
            "SELECT COUNT(*) FROM workflow_runs WHERE started_at >= date('now')"
        )
        row = await cursor.fetchone()
        return row[0]

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

    # --- Server Config ---

    async def get_server_config(self, key: str) -> str | None:
        cursor = await self.db.execute(
            "SELECT value FROM server_config WHERE key = ?", (key,)
        )
        row = await cursor.fetchone()
        return row["value"] if row else None

    async def set_server_config(self, key: str, value: str) -> None:
        await self.db.execute(
            """INSERT INTO server_config (key, value, updated_at)
               VALUES (?, ?, datetime('now'))
               ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')""",
            (key, value),
        )
        await self.db.commit()

    async def get_all_server_config(self) -> dict[str, str]:
        cursor = await self.db.execute("SELECT key, value FROM server_config")
        rows = await cursor.fetchall()
        return {r["key"]: r["value"] for r in rows}
