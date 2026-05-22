# Oculos V2 — Detailed Build Plan

> **Purpose:** This document is the single source of truth for building Oculos V2. Any model (Opus, Sonnet, Haiku) should be able to pick up any section and implement it precisely.
>
> **Rule:** All git commits must be authored solely by `Chinmay Murugkar <cthecm@gmail.com>`. Never add Co-Authored-By or Claude attribution.

---

## Current State (as of 2026-05-22)

### Repo Structure
```
oculos/
├── packages/
│   ├── server/oculos/          # Python FastAPI backend (35 routes, 9 API modules)
│   │   ├── app.py              # App factory, lifespan, CORS, static mount
│   │   ├── db.py               # SQLite via aiosqlite, 8 tables, ~40 methods
│   │   ├── models.py           # Pydantic models (Agent, Trace, Cost, Prompt, Secret, Budget, Alert, Audit)
│   │   ├── cli.py              # Click CLI: `oculos up`, `oculos status`, `oculos agents`
│   │   ├── heartbeat.py        # Background health polling (30s interval)
│   │   └── api/                # 9 route modules (agents, traces, status, prompts, secrets, budgets, topology, alerts, audit)
│   ├── dashboard/src/          # React 19 + Vite 8 + Tailwind v4
│   │   ├── App.jsx             # SPA router (10 pages)
│   │   ├── components/Sidebar.jsx  # 9 nav items + live feed + server status
│   │   ├── components/pages/   # 10 page components
│   │   ├── hooks.js            # usePolling(fetchFn, intervalMs)
│   │   ├── utils.js            # fmt$$, fmtNum, relativeTime, buildCostTimeline, groupTraces, EVENT_COLORS
│   │   ├── api.js              # 7 fetch wrappers (getStatus, getAgents, getAgent, getAgentCost, getTraces, getCostSummary, deleteAgent)
│   │   └── index.css           # Tailwind v4 @theme inline (dark theme)
│   └── sdk/                    # oculos-sdk Python package (not modified in this plan)
```

### Tech Stack
- **Backend:** Python 3.10+, FastAPI, aiosqlite, Pydantic v2, Fernet encryption
- **Frontend:** React 19, Vite 8, Tailwind CSS v4 (`@import "tailwindcss"` + `@theme inline`), Recharts, Lucide React
- **Database:** SQLite (single file at `~/.oculos/oculos.db`)
- **Build:** Dashboard builds to `packages/server/oculos/static/`, served by FastAPI

### Key Patterns
- `usePolling(fetchFn, intervalMs)` → `{data, error, loading, refresh}` for all data fetching
- All API calls go through `const BASE = '/api'` prefix
- Tailwind v4 custom colors: `bg-bg`, `bg-card`, `bg-sidebar`, `text-primary`, `text-secondary`, `text-muted`, `text-accent`, `border-border`
- Animations: `fade-in-up`, `pulse-ring`, `blink`
- FastAPI dependency injection via `get_db()` global function
- Vite proxy: dev mode proxies `/api` to `localhost:9090`

---

## Phase 4: Auth + Settings

**Model assignment:** Use **Sonnet** for all of Phase 4.

**Why Sonnet:** This is straightforward backend CRUD + frontend forms. Well-defined patterns, no architectural decisions needed. Everything is specified below.

### 4.1 — Install new Python dependency

**File:** `packages/server/pyproject.toml`

Add `"pyjwt>=2.8.0"` to the `dependencies` list (after `"cryptography>=42.0.0"`). PyJWT is used for session tokens.

### 4.2 — Database: new tables

**File:** `packages/server/oculos/db.py`

Add these 3 tables to the `SCHEMA` string (after the `audit_log` table):

```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,          -- 'github' or 'google'
    provider_id TEXT NOT NULL,       -- GitHub/Google user ID
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'admin',  -- 'admin', 'editor', 'viewer'
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

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,        -- first 8 chars of key, for display: 'ocu_abcd...'
    key_hash TEXT NOT NULL,          -- SHA-256 hash of full key
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used TEXT,
    expires_at TEXT
);
```

Add these indexes after the existing indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
```

Add these DB methods to the `Database` class:

```python
# ── Users ──────────────────────────────────────

async def upsert_user(self, provider: str, provider_id: str, email: str | None,
                      name: str | None, avatar_url: str | None) -> dict:
    """Create or update user on OAuth login. Returns user dict."""
    user_id = str(uuid.uuid4())
    async with self._db.execute(
        """INSERT INTO users (id, provider, provider_id, email, name, avatar_url, last_login)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(provider, provider_id) DO UPDATE SET
             email=excluded.email, name=excluded.name, avatar_url=excluded.avatar_url,
             last_login=datetime('now')
           RETURNING *""",
        (user_id, provider, provider_id, email, name, avatar_url),
    ) as cur:
        row = await cur.fetchone()
        await self._db.commit()
        return dict(row)

async def get_user(self, user_id: str) -> dict | None:
    async with self._db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cur:
        row = await cur.fetchone()
        return dict(row) if row else None

async def list_users(self) -> list[dict]:
    async with self._db.execute("SELECT * FROM users ORDER BY created_at DESC") as cur:
        return [dict(r) for r in await cur.fetchall()]

# ── Sessions ───────────────────────────────────

async def create_session(self, user_id: str, token_hash: str, expires_at: str) -> dict:
    sid = str(uuid.uuid4())
    async with self._db.execute(
        "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?) RETURNING *",
        (sid, user_id, token_hash, expires_at),
    ) as cur:
        row = await cur.fetchone()
        await self._db.commit()
        return dict(row)

async def get_session_by_token_hash(self, token_hash: str) -> dict | None:
    async with self._db.execute(
        "SELECT s.*, u.email, u.name, u.avatar_url, u.role, u.provider "
        "FROM sessions s JOIN users u ON s.user_id = u.id "
        "WHERE s.token_hash = ? AND s.expires_at > datetime('now')",
        (token_hash,),
    ) as cur:
        row = await cur.fetchone()
        return dict(row) if row else None

async def delete_session(self, session_id: str) -> None:
    await self._db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    await self._db.commit()

async def cleanup_expired_sessions(self) -> None:
    await self._db.execute("DELETE FROM sessions WHERE expires_at < datetime('now')")
    await self._db.commit()

# ── API Keys ───────────────────────────────────

async def create_api_key(self, user_id: str, name: str, key_prefix: str,
                         key_hash: str, expires_at: str | None = None) -> dict:
    kid = str(uuid.uuid4())
    async with self._db.execute(
        "INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, expires_at) "
        "VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
        (kid, user_id, name, key_prefix, key_hash, expires_at),
    ) as cur:
        row = await cur.fetchone()
        await self._db.commit()
        return dict(row)

async def get_api_key_by_hash(self, key_hash: str) -> dict | None:
    async with self._db.execute(
        "SELECT k.*, u.role FROM api_keys k JOIN users u ON k.user_id = u.id "
        "WHERE k.key_hash = ? AND (k.expires_at IS NULL OR k.expires_at > datetime('now'))",
        (key_hash,),
    ) as cur:
        row = await cur.fetchone()
        if row:
            await self._db.execute(
                "UPDATE api_keys SET last_used = datetime('now') WHERE id = ?",
                (dict(row)["id"],),
            )
            await self._db.commit()
        return dict(row) if row else None

async def list_api_keys(self, user_id: str) -> list[dict]:
    async with self._db.execute(
        "SELECT id, name, key_prefix, created_at, last_used, expires_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ) as cur:
        return [dict(r) for r in await cur.fetchall()]

async def delete_api_key(self, key_id: str) -> bool:
    cur = await self._db.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
    await self._db.commit()
    return cur.rowcount > 0
```

### 4.3 — Auth middleware

**Create file:** `packages/server/oculos/auth.py`

This module handles auth state detection and session/API key validation.

```python
"""
Authentication middleware for Oculos.

Auth is OPTIONAL — controlled by environment variables:
  OCULOS_GITHUB_CLIENT_ID + OCULOS_GITHUB_CLIENT_SECRET → enables GitHub OAuth
  OCULOS_GOOGLE_CLIENT_ID + OCULOS_GOOGLE_CLIENT_SECRET → enables Google OAuth

If NO env vars are set → auth is disabled → all requests pass through (local mode).
If ANY provider is configured → auth is enabled → all /api routes require valid session or API key.

Exceptions (always public):
  GET /health
  GET /api/status
  POST /api/traces          (SDK ingest — uses API key or is open in local mode)
  POST /api/traces/cost     (SDK ingest — same)
  GET /auth/*               (OAuth flow endpoints)
  POST /auth/*              (OAuth flow endpoints)
  GET /                     (Dashboard static files)
"""
import hashlib
import os
from functools import lru_cache

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware


@lru_cache()
def auth_enabled() -> bool:
    return bool(
        os.environ.get("OCULOS_GITHUB_CLIENT_ID")
        or os.environ.get("OCULOS_GOOGLE_CLIENT_ID")
    )


PUBLIC_PATHS = {"/health", "/api/status", "/api/traces", "/api/traces/cost"}
PUBLIC_PREFIXES = ("/auth/", "/assets/", "/favicon")


def _is_public(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    for prefix in PUBLIC_PREFIXES:
        if path.startswith(prefix):
            return True
    if path == "/" or not path.startswith("/api"):
        return True
    return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not auth_enabled() or _is_public(request.url.path):
            request.state.user = None
            return await call_next(request)

        from .app import get_db
        db = get_db()

        # Check session cookie
        token = request.cookies.get("oculos_session")
        if token:
            session = await db.get_session_by_token_hash(hash_token(token))
            if session:
                request.state.user = session
                return await call_next(request)

        # Check API key header: Authorization: Bearer ocu_xxxxx
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer ocu_"):
            api_key = auth_header[7:]  # strip "Bearer "
            key_data = await db.get_api_key_by_hash(hash_token(api_key))
            if key_data:
                request.state.user = key_data
                return await call_next(request)

        raise HTTPException(status_code=401, detail="Authentication required")
```

### 4.4 — Auth API routes

**Create file:** `packages/server/oculos/api/auth.py`

```python
"""
OAuth endpoints:
  GET  /auth/providers        → list enabled providers
  GET  /auth/github           → redirect to GitHub OAuth
  GET  /auth/github/callback  → handle GitHub callback, set session cookie
  GET  /auth/google           → redirect to Google OAuth
  GET  /auth/google/callback  → handle Google callback, set session cookie
  GET  /auth/me               → current user info
  POST /auth/logout           → clear session
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import RedirectResponse

from ..app import get_db
from ..auth import hash_token, auth_enabled

router = APIRouter(prefix="/auth", tags=["auth"])

GITHUB_CLIENT_ID = os.environ.get("OCULOS_GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("OCULOS_GITHUB_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID = os.environ.get("OCULOS_GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("OCULOS_GOOGLE_CLIENT_SECRET", "")
SESSION_MAX_AGE_DAYS = 30


@router.get("/providers")
async def list_providers():
    """Returns which OAuth providers are enabled. Used by login page."""
    return {
        "auth_enabled": auth_enabled(),
        "github": bool(GITHUB_CLIENT_ID),
        "google": bool(GOOGLE_CLIENT_ID),
    }


# ── GitHub OAuth ───────────────────────────────

@router.get("/github")
async def github_login(request: Request):
    if not GITHUB_CLIENT_ID:
        raise HTTPException(400, "GitHub OAuth not configured")
    # Build the callback URL from the current request
    callback = str(request.url_for("github_callback"))
    url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={callback}"
        f"&scope=read:user user:email"
    )
    return RedirectResponse(url)


@router.get("/github/callback")
async def github_callback(code: str, response: Response):
    if not GITHUB_CLIENT_ID:
        raise HTTPException(400, "GitHub OAuth not configured")
    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={"client_id": GITHUB_CLIENT_ID, "client_secret": GITHUB_CLIENT_SECRET, "code": code},
            headers={"Accept": "application/json"},
        )
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(400, "GitHub OAuth failed")

        # Fetch user info
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        gh_user = user_resp.json()

        # Fetch email if not public
        email = gh_user.get("email")
        if not email:
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            for e in emails_resp.json():
                if e.get("primary"):
                    email = e["email"]
                    break

    db = get_db()
    user = await db.upsert_user(
        provider="github",
        provider_id=str(gh_user["id"]),
        email=email,
        name=gh_user.get("name") or gh_user.get("login"),
        avatar_url=gh_user.get("avatar_url"),
    )

    # Create session
    session_token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_MAX_AGE_DAYS)
    await db.create_session(user["id"], hash_token(session_token), expires.isoformat())

    resp = RedirectResponse("/", status_code=302)
    resp.set_cookie(
        "oculos_session", session_token,
        max_age=SESSION_MAX_AGE_DAYS * 86400,
        httponly=True, samesite="lax", path="/",
    )
    return resp


# ── Google OAuth ───────────────────────────────

@router.get("/google")
async def google_login(request: Request):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(400, "Google OAuth not configured")
    callback = str(request.url_for("google_callback"))
    url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={callback}"
        f"&response_type=code"
        f"&scope=openid email profile"
    )
    return RedirectResponse(url)


@router.get("/google/callback")
async def google_callback(code: str, request: Request, response: Response):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(400, "Google OAuth not configured")
    callback = str(request.url_for("google_callback"))
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": callback,
                "grant_type": "authorization_code",
            },
        )
        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        if not access_token:
            raise HTTPException(400, "Google OAuth failed")

        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        g_user = user_resp.json()

    db = get_db()
    user = await db.upsert_user(
        provider="google",
        provider_id=str(g_user["id"]),
        email=g_user.get("email"),
        name=g_user.get("name"),
        avatar_url=g_user.get("picture"),
    )

    session_token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_MAX_AGE_DAYS)
    await db.create_session(user["id"], hash_token(session_token), expires.isoformat())

    resp = RedirectResponse("/", status_code=302)
    resp.set_cookie(
        "oculos_session", session_token,
        max_age=SESSION_MAX_AGE_DAYS * 86400,
        httponly=True, samesite="lax", path="/",
    )
    return resp


# ── Session ────────────────────────────────────

@router.get("/me")
async def get_me(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return {
        "id": user.get("user_id") or user.get("id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "avatar_url": user.get("avatar_url"),
        "role": user.get("role"),
        "provider": user.get("provider"),
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("oculos_session")
    if token:
        db = get_db()
        session = await db.get_session_by_token_hash(hash_token(token))
        if session:
            await db.delete_session(session["id"])
    resp = Response(status_code=204)
    resp.delete_cookie("oculos_session", path="/")
    return resp
```

### 4.5 — Settings & API Keys route

**Create file:** `packages/server/oculos/api/settings.py`

```python
"""
Settings endpoints:
  GET  /api/settings          → server info, auth status, stats
  GET  /api/settings/keys     → list current user's API keys
  POST /api/settings/keys     → create a new API key (returns raw key ONCE)
  DELETE /api/settings/keys/{id} → revoke an API key
"""
import secrets

from fastapi import APIRouter, Request, HTTPException

from ..app import get_db
from ..auth import auth_enabled, hash_token

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
        } if user else None,
        "server": {
            "version": "0.1.0",
            "agents_count": agents_count,
            "total_cost": total_cost,
        },
    }


@router.get("/keys")
async def list_keys(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        return []  # No auth mode — no keys to manage
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

    # Return raw key ONLY on creation — it's never stored or shown again
    return {**record, "raw_key": raw_key}


@router.delete("/keys/{key_id}", status_code=204)
async def revoke_key(key_id: str):
    db = get_db()
    await db.delete_api_key(key_id)
```

### 4.6 — Register auth in app.py

**File:** `packages/server/oculos/app.py`

Changes to `create_app()`:

1. Add import at top: `from .auth import AuthMiddleware`
2. Add import: `from .api import auth as auth_routes, settings as settings_routes`
3. Register AuthMiddleware AFTER CORSMiddleware: `app.add_middleware(AuthMiddleware)`
4. Include routers: `app.include_router(auth_routes.router)` and `app.include_router(settings_routes.router)`

Order matters — CORSMiddleware must wrap AuthMiddleware (CORS runs first).

### 4.7 — Dashboard: Login Page

**Create file:** `packages/dashboard/src/components/pages/LoginPage.jsx`

A full-screen login page shown when auth is enabled and user is not logged in.

**Layout:**
- Centered card on dark background
- OculOS logo + "Sign in to OculOS" heading
- "Sign in with GitHub" button (github icon + text, dark button with border)
- "Sign in with Google" button (google icon + text, dark button with border)
- Only show buttons for enabled providers (check `/auth/providers`)
- Footer: "Self-hosted · Your data stays local"

**Behavior:**
- On mount, fetch `GET /auth/providers` to determine which buttons to show
- GitHub button links to `/auth/github` (full page redirect, NOT fetch)
- Google button links to `/auth/google` (full page redirect, NOT fetch)
- If `auth_enabled === false`, this page is never shown

**Styling:** Use existing Tailwind theme colors. The card should use `bg-card border border-border rounded-2xl`. Buttons use `bg-sidebar border border-border hover:border-border-bright`.

### 4.8 — Dashboard: Settings Page

**Create file:** `packages/dashboard/src/components/pages/SettingsPage.jsx`

**Layout — 3 sections stacked vertically:**

**Section 1: Server Info**
```
┌─ Server ─────────────────────────────────────────────┐
│  Version: 0.1.0                                       │
│  Agents: 5       Total Cost: $12.34                   │
│  Database: local (SQLite)                             │
│  Auth: GitHub OAuth (enabled)                         │
└───────────────────────────────────────────────────────┘
```
- Fetch from `GET /api/settings`
- Simple key-value display using `text-secondary` labels and `text-primary` values

**Section 2: Profile (only when auth enabled)**
```
┌─ Profile ────────────────────────────────────────────┐
│  [Avatar]  Chinmay Murugkar                           │
│            cthecm@gmail.com                           │
│            Signed in via GitHub · Admin               │
│                                          [Sign Out]   │
└───────────────────────────────────────────────────────┘
```
- Avatar: `<img>` with `rounded-full h-10 w-10`
- Sign Out: calls `POST /auth/logout` then reloads page

**Section 3: API Keys (only when auth enabled)**
```
┌─ API Keys ───────────────────────────────────────────┐
│  These keys authenticate SDK and CI/CD requests.      │
│                                                       │
│  ocu_a1b2c3d4...  "CI Pipeline"   Created 2d ago     │
│                                          [Revoke]     │
│  ocu_e5f6g7h8...  "Local Dev"     Created 1w ago     │
│                                          [Revoke]     │
│                                                       │
│  Key name: [________________]  [Create New Key]       │
│                                                       │
│  ⚠ Copy your key now — it won't be shown again       │
│  [ocu_xxxxxxxxxxxxxxxxxxxxxxxxxxxx]  [Copy]           │
└───────────────────────────────────────────────────────┘
```
- List: fetch `GET /api/settings/keys`
- Create: `POST /api/settings/keys` with `{name}` → show raw_key once in a highlighted box with copy button
- Revoke: `DELETE /api/settings/keys/{id}` → refresh list
- Each row shows: `key_prefix`, `name`, `created_at` (relative), `last_used` (relative or "never"), revoke button

### 4.9 — Dashboard: Wire auth into App.jsx

**File:** `packages/dashboard/src/App.jsx`

**Changes:**
1. Import `LoginPage` and `SettingsPage`
2. Add `settings` to the page router (`if (page === 'settings') return <SettingsPage />;`)
3. Add auth state management:

```javascript
const [authState, setAuthState] = useState({ checked: false, user: null, authEnabled: false });

useEffect(() => {
  fetch('/auth/providers').then(r => r.json()).then(p => {
    if (!p.auth_enabled) {
      setAuthState({ checked: true, user: null, authEnabled: false });
    } else {
      fetch('/auth/me').then(r => {
        if (r.ok) return r.json();
        throw new Error('not authed');
      })
        .then(user => setAuthState({ checked: true, user, authEnabled: true }))
        .catch(() => setAuthState({ checked: true, user: null, authEnabled: true }));
    }
  });
}, []);

// Before rendering anything:
if (!authState.checked) return <div className="flex h-screen items-center justify-center bg-bg"><div className="text-sm text-muted">Loading...</div></div>;
if (authState.authEnabled && !authState.user) return <LoginPage />;
```

4. Pass `user` to Sidebar: `<Sidebar page={activePage} onNav={handleNav} user={authState.user} />`

### 4.10 — Dashboard: Update Sidebar with Settings nav + user avatar

**File:** `packages/dashboard/src/components/Sidebar.jsx`

**Changes:**
1. Add `Settings` import from lucide-react (the gear icon)
2. Add to NAV array: `{ id: 'settings', label: 'Settings', icon: Settings }`
3. Accept `user` prop: `export default function Sidebar({ page, onNav, user })`
4. Add user avatar above server status (at the bottom of sidebar), only when `user` is truthy:

```jsx
{user && (
  <div className="border-t border-border p-3">
    <div className="flex items-center gap-2 px-2">
      <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full" />
      <span className="text-xs text-secondary truncate flex-1">{user.name}</span>
    </div>
  </div>
)}
```

### 4.11 — Build & Test

After all Phase 4 changes:

```bash
cd packages/dashboard && npm run build
cd ../.. && .venv/bin/pip install -e packages/server
.venv/bin/oculos up
```

**Test checklist:**
- [ ] Dashboard loads at localhost:9090 (no env vars = no auth = open access)
- [ ] Settings page shows server info
- [ ] Settings page shows "Auth: Not configured" when no env vars
- [ ] All existing pages still work (overview, agents, traces, etc.)
- [ ] No console errors

**Auth testing (requires GitHub OAuth app):**
- [ ] Set `OCULOS_GITHUB_CLIENT_ID` and `OCULOS_GITHUB_CLIENT_SECRET` env vars
- [ ] Restart server → dashboard shows login page
- [ ] Click "Sign in with GitHub" → redirects to GitHub → callback → logged in
- [ ] Settings page shows profile + API keys section
- [ ] Create API key → raw key shown once
- [ ] Sign out → redirected to login page

Commit message: `feat: auth system — GitHub/Google OAuth, sessions, API keys, settings page`

---

## Phase 5: Workflow Engine + Visual Graph

**This is the largest and most complex phase. Split into sub-phases with model assignments.**

### 5A — Workflow Data Model + CRUD API

**Model assignment:** Use **Sonnet**

#### 5A.1 — Database tables

**File:** `packages/server/oculos/db.py`

Add to SCHEMA:

```sql
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '⚡',
    nodes TEXT NOT NULL DEFAULT '[]',          -- JSON array of node objects
    edges TEXT NOT NULL DEFAULT '[]',          -- JSON array of edge objects
    trigger_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'schedule', 'webhook'
    trigger_config TEXT NOT NULL DEFAULT '{}',  -- JSON: {cron: "0 9 * * 1-5"} or {path: "/hook/xyz"}
    guardrails TEXT NOT NULL DEFAULT '{}',      -- JSON: {max_cost: 0.50, max_steps: 20}
    status TEXT NOT NULL DEFAULT 'inactive',    -- 'active', 'inactive', 'error'
    created_by TEXT,                            -- user_id (nullable for local mode)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',    -- 'running', 'completed', 'failed', 'cancelled'
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    total_cost REAL NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL DEFAULT 0,
    node_results TEXT NOT NULL DEFAULT '{}',   -- JSON: {node_id: {status, output, cost, duration_ms}}
    error TEXT,
    trigger_type TEXT NOT NULL DEFAULT 'manual' -- what triggered this run
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started ON workflow_runs(started_at);
```

#### 5A.2 — Pydantic models

**File:** `packages/server/oculos/models.py`

Add at the end:

```python
# ── Workflows ──────────────────────────────────

class WorkflowNode(BaseModel):
    id: str
    type: str                          # e.g. "trigger/schedule", "ai/transform", "tool/mcp", "logic/branch"
    label: str = ""
    config: dict = {}                  # type-specific config
    position: dict = {"x": 0, "y": 0} # auto-computed, stored for caching

class WorkflowEdge(BaseModel):
    id: str
    source: str                        # node ID
    target: str                        # node ID
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
    node_results: dict           # {node_id: {status, output, cost, duration_ms}}
    error: str | None
    trigger_type: str
```

#### 5A.3 — Database methods

**File:** `packages/server/oculos/db.py`

Add methods:

```python
# ── Workflows ──────────────────────────────────

async def create_workflow(self, data: dict) -> dict:
    wf_id = str(uuid.uuid4())
    async with self._db.execute(
        """INSERT INTO workflows (id, name, description, icon, nodes, edges,
           trigger_type, trigger_config, guardrails, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *""",
        (wf_id, data["name"], data.get("description", ""), data.get("icon", "⚡"),
         json.dumps(data.get("nodes", [])), json.dumps(data.get("edges", [])),
         data.get("trigger_type", "manual"), json.dumps(data.get("trigger_config", {})),
         json.dumps(data.get("guardrails", {})), data.get("status", "inactive"),
         data.get("created_by")),
    ) as cur:
        row = await cur.fetchone()
        await self._db.commit()
        r = dict(row)
        r["nodes"] = json.loads(r["nodes"])
        r["edges"] = json.loads(r["edges"])
        r["trigger_config"] = json.loads(r["trigger_config"])
        r["guardrails"] = json.loads(r["guardrails"])
        return r

async def get_workflow(self, wf_id: str) -> dict | None:
    async with self._db.execute("SELECT * FROM workflows WHERE id = ?", (wf_id,)) as cur:
        row = await cur.fetchone()
        if not row:
            return None
        r = dict(row)
        r["nodes"] = json.loads(r["nodes"])
        r["edges"] = json.loads(r["edges"])
        r["trigger_config"] = json.loads(r["trigger_config"])
        r["guardrails"] = json.loads(r["guardrails"])
        return r

async def list_workflows(self) -> list[dict]:
    async with self._db.execute("SELECT * FROM workflows ORDER BY updated_at DESC") as cur:
        rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["nodes"] = json.loads(r["nodes"])
            r["edges"] = json.loads(r["edges"])
            r["trigger_config"] = json.loads(r["trigger_config"])
            r["guardrails"] = json.loads(r["guardrails"])
            results.append(r)
        return results

async def update_workflow(self, wf_id: str, data: dict) -> dict | None:
    fields = []
    values = []
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
    await self._db.execute(
        f"UPDATE workflows SET {', '.join(fields)} WHERE id = ?", values
    )
    await self._db.commit()
    return await self.get_workflow(wf_id)

async def delete_workflow(self, wf_id: str) -> bool:
    cur = await self._db.execute("DELETE FROM workflows WHERE id = ?", (wf_id,))
    await self._db.commit()
    return cur.rowcount > 0

# ── Workflow Runs ──────────────────────────────

async def create_workflow_run(self, workflow_id: str, trigger_type: str = "manual") -> dict:
    run_id = str(uuid.uuid4())
    async with self._db.execute(
        "INSERT INTO workflow_runs (id, workflow_id, trigger_type) VALUES (?, ?, ?) RETURNING *",
        (run_id, workflow_id, trigger_type),
    ) as cur:
        row = await cur.fetchone()
        await self._db.commit()
        r = dict(row)
        r["node_results"] = json.loads(r["node_results"])
        return r

async def update_workflow_run(self, run_id: str, **kwargs) -> dict | None:
    fields = []
    values = []
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
    await self._db.execute(
        f"UPDATE workflow_runs SET {', '.join(fields)} WHERE id = ?", values
    )
    await self._db.commit()
    async with self._db.execute("SELECT * FROM workflow_runs WHERE id = ?", (run_id,)) as cur:
        row = await cur.fetchone()
        if not row:
            return None
        r = dict(row)
        r["node_results"] = json.loads(r["node_results"])
        return r

async def list_workflow_runs(self, workflow_id: str | None = None, limit: int = 50) -> list[dict]:
    if workflow_id:
        sql = "SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?"
        params = (workflow_id, limit)
    else:
        sql = "SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT ?"
        params = (limit,)
    async with self._db.execute(sql, params) as cur:
        rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["node_results"] = json.loads(r["node_results"])
            results.append(r)
        return results
```

#### 5A.4 — API routes

**Create file:** `packages/server/oculos/api/workflows.py`

```python
"""
Workflow CRUD:
  GET    /api/workflows                    → list all workflows
  POST   /api/workflows                    → create workflow
  GET    /api/workflows/{id}               → get workflow
  PATCH  /api/workflows/{id}               → update workflow
  DELETE /api/workflows/{id}               → delete workflow
  POST   /api/workflows/{id}/run           → trigger a manual run
  GET    /api/workflows/{id}/runs          → list runs for workflow
  GET    /api/workflows/runs/recent        → recent runs across all workflows (activity feed)
"""
from fastapi import APIRouter, HTTPException, Request

from ..app import get_db

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
    # TODO: Phase 5B — actually execute the workflow via the engine
    # For now, return the run record (status: running)
    return run


@router.get("/{wf_id}/runs")
async def list_runs(wf_id: str):
    db = get_db()
    return await db.list_workflow_runs(workflow_id=wf_id)
```

Register in app.py: `from .api import workflows as workflows_routes` then `app.include_router(workflows_routes.router)`.

---

### 5B — Workflow Execution Engine

**Model assignment:** Use **Opus**

**Why Opus:** This is the most architecturally complex piece. The engine must orchestrate node execution, handle branching, call MCP tools, manage AI completions, enforce guardrails, and track costs — all asynchronously. This requires careful reasoning about execution order, error handling, and state management.

#### 5B.1 — Engine architecture

**Create file:** `packages/server/oculos/engine/__init__.py` (empty)

**Create file:** `packages/server/oculos/engine/executor.py`

**Purpose:** Takes a workflow definition + run ID, executes nodes in topological order, updates run status.

**Specification:**

```python
class WorkflowExecutor:
    def __init__(self, db: Database):
        self.db = db

    async def execute(self, workflow: dict, run_id: str) -> dict:
        """
        Execute a workflow. This is the main entry point.

        1. Parse nodes and edges into a DAG
        2. Topological sort (respecting edges)
        3. Execute each node in order:
           - trigger/* nodes: skip (already triggered)
           - tool/* nodes: call the appropriate tool (MCP, HTTP, file, etc.)
           - ai/* nodes: call LLM with the node's prompt + input data
           - logic/branch: evaluate condition, choose path
           - logic/loop: iterate over input list
        4. Pass output of each node as input to connected downstream nodes
        5. Track cost, duration, output for each node
        6. Enforce guardrails (max_cost, max_steps)
        7. Update workflow_run record with results
        8. Return final run record

        Error handling:
        - If any node fails, mark the run as 'failed' with the error
        - If guardrail triggers, mark as 'cancelled' with reason
        - Always update the run record, even on failure

        Data flow:
        - Each node receives `input_data` (output of upstream nodes)
        - Each node produces `output_data` (passed to downstream nodes)
        - For branch nodes, only one path is followed
        - For loop nodes, the downstream subgraph runs once per item
        """
```

**Node execution dispatch:**

```python
async def _execute_node(self, node: dict, input_data: dict, context: dict) -> dict:
    """Returns {status: 'ok'|'error', output: any, cost: float, duration_ms: int}"""
    node_type = node["type"]

    if node_type == "ai/transform":
        return await self._exec_ai_transform(node, input_data, context)
    elif node_type == "ai/decide":
        return await self._exec_ai_decide(node, input_data, context)
    elif node_type == "ai/generate":
        return await self._exec_ai_generate(node, input_data, context)
    elif node_type == "ai/guard":
        return await self._exec_ai_guard(node, input_data, context)
    elif node_type == "tool/http":
        return await self._exec_http(node, input_data)
    elif node_type == "tool/mcp":
        return await self._exec_mcp(node, input_data, context)
    elif node_type == "logic/branch":
        return await self._exec_branch(node, input_data)
    elif node_type == "logic/loop":
        return await self._exec_loop(node, input_data)
    elif node_type.startswith("trigger/"):
        return {"status": "ok", "output": input_data, "cost": 0, "duration_ms": 0}
    else:
        return {"status": "error", "output": None, "cost": 0, "duration_ms": 0,
                "error": f"Unknown node type: {node_type}"}
```

**AI node execution (uses httpx to call LLM APIs):**

```python
async def _exec_ai_transform(self, node: dict, input_data: dict, context: dict) -> dict:
    """
    Calls the user's LLM API (OpenAI-compatible endpoint).
    Config expected:
      node.config.model: str (e.g. "gpt-4o-mini")
      node.config.prompt: str (the system/instruction prompt)
      node.config.api_key_secret: str | None (secret name from vault)
      node.config.base_url: str (default "https://api.openai.com/v1")

    The input_data is formatted as the user message content.
    Returns the LLM response text as output.
    Tracks token usage and cost.
    """
```

**Key design decisions for the Opus implementer:**
- Use `httpx.AsyncClient` for all external calls (LLM APIs, MCP, HTTP)
- LLM calls use the OpenAI-compatible chat completions endpoint (works with OpenAI, Anthropic via proxy, local models via Ollama)
- API keys are fetched from the secrets vault (already built) — the node config references a secret name, the engine resolves it
- Cost estimation: use token counts × model pricing (maintain a simple pricing dict, or let users configure)
- The engine runs as an async task — `asyncio.create_task()` from the API route, so the HTTP response returns immediately with the run ID
- WebSocket notification when run completes (stretch goal, can poll initially)

#### 5B.2 — Scheduler

**Create file:** `packages/server/oculos/engine/scheduler.py`

**Purpose:** Evaluates cron triggers and fires workflow runs on schedule.

```python
class WorkflowScheduler:
    """
    Background task that:
    1. Every 60 seconds, queries all workflows where status='active' and trigger_type='schedule'
    2. Parses trigger_config.cron (standard 5-field cron expression)
    3. If current time matches cron, creates a workflow_run and calls executor.execute()
    4. Tracks last_triggered to prevent double-firing within the same minute

    Uses the `croniter` library for cron parsing.
    Add "croniter>=2.0.0" to pyproject.toml dependencies.

    Integrates into app.py lifespan: start on startup, stop on shutdown (same pattern as HeartbeatMonitor).
    """
```

---

### 5C — NL-to-Workflow Generator

**Model assignment:** Use **Opus**

**Why Opus:** This requires designing the prompt engineering strategy for converting natural language to workflow graphs. Needs careful reasoning about template matching, node selection, and edge wiring.

**Create file:** `packages/server/oculos/engine/planner.py`

```python
class WorkflowPlanner:
    """
    Converts natural language descriptions to workflow node graphs.

    Strategy (hybrid — template matching + LLM):

    1. Maintain a library of workflow templates in packages/server/oculos/engine/templates/
       Each template is a JSON file with: trigger, description, keywords, nodes, edges
       Example: morning-email-digest.json, lead-research.json, etc.

    2. On input:
       a. Embed the user's description (or use keyword matching)
       b. Find the closest matching template(s)
       c. If match confidence > 0.8: use template, customize parameters via LLM
       d. If no match: use LLM to generate workflow from scratch

    3. LLM generation prompt (for step 2d):
       - System prompt defines available node types and their configs
       - User prompt is the workflow description
       - Output is a JSON object: {nodes: [...], edges: [...], trigger_type, trigger_config}
       - Use structured output (JSON mode) for reliability

    4. Post-processing:
       - Validate all node types exist
       - Validate all edges reference valid node IDs
       - Assign auto-layout positions (simple left-to-right, 250px spacing)
       - Return the workflow for user review

    API endpoint:
      POST /api/workflows/generate
      Body: {description: "Every morning check Gmail..."}
      Returns: {name, description, nodes, edges, trigger_type, trigger_config}
      (Not saved yet — user reviews and clicks Create)
    """
```

**Create directory:** `packages/server/oculos/engine/templates/`

Create 5 starter templates (JSON files):

1. `email-digest.json` — Schedule → Email Read → AI Summarize → Slack Post
2. `webhook-processor.json` — Webhook → AI Transform → HTTP Post
3. `content-monitor.json` — Schedule → HTTP Fetch → AI Analyze → Branch → Output
4. `data-pipeline.json` — Schedule → HTTP Fetch → AI Transform → File Write
5. `alert-responder.json` — Webhook → AI Decide → Branch → HTTP Post

Each template format:
```json
{
  "name": "Morning Email Digest",
  "description": "Summarize new emails and post to a messaging channel",
  "keywords": ["email", "digest", "summary", "morning", "gmail", "slack", "daily"],
  "trigger_type": "schedule",
  "trigger_config": {"cron": "0 9 * * 1-5"},
  "nodes": [
    {"id": "t1", "type": "trigger/schedule", "label": "Every weekday at 9am", "config": {}},
    {"id": "n1", "type": "tool/mcp", "label": "Read emails", "config": {"tool_name": "read_inbox", "mcp_server": ""}},
    {"id": "n2", "type": "ai/transform", "label": "Summarize", "config": {"prompt": "Summarize each email in 2-3 sentences. Focus on action items.", "model": "gpt-4o-mini"}},
    {"id": "n3", "type": "tool/mcp", "label": "Post summary", "config": {"tool_name": "post_message", "mcp_server": ""}}
  ],
  "edges": [
    {"id": "e1", "source": "t1", "target": "n1"},
    {"id": "e2", "source": "n1", "target": "n2"},
    {"id": "e3", "source": "n2", "target": "n3"}
  ]
}
```

---

### 5D — Dashboard: Workflow Visual Graph + Pages

**Model assignment:** Use **Sonnet**

**Why Sonnet:** Frontend component work. The specs below are precise enough for Sonnet to implement directly.

#### 5D.1 — Install React Flow

```bash
cd packages/dashboard && npm install @xyflow/react
```

Note: This is React Flow v12+ (the `@xyflow/react` package, NOT the old `reactflow` package).

#### 5D.2 — Workflow Graph Component

**Create file:** `packages/dashboard/src/components/canvas/WorkflowGraph.jsx`

**Purpose:** Renders a workflow's nodes and edges as an auto-laid-out interactive graph using React Flow.

**Props:**
```javascript
{
  nodes: [{id, type, label, config, position}],   // from workflow.nodes
  edges: [{id, source, target, label}],            // from workflow.edges
  runResults: {node_id: {status, output, cost}},   // from workflow_run.node_results (optional)
  onNodeClick: (nodeId) => void,                   // opens config panel
  isRunning: boolean,                               // enables animation
}
```

**Behavior:**
- Convert workflow nodes to React Flow nodes with custom renderers
- Convert workflow edges to React Flow edges with custom styling
- Use `dagre` layout library to auto-position nodes left-to-right (install: `npm install dagre`)
- Fit view on mount
- Disable drag (nodes don't move — L3 visual, not L4 canvas)
- Enable zoom and pan
- Show "+" button on edges for inserting nodes (stretch — can add later)
- When `isRunning`, animate nodes sequentially (pulse effect on current node)
- When `runResults` present, show status indicators on each node (green check, red X)

**Node types to register with React Flow:**

```javascript
const nodeTypes = {
  trigger: TriggerNodeComponent,
  tool: ToolNodeComponent,
  ai: AINodeComponent,
  logic: LogicNodeComponent,
  output: OutputNodeComponent,
};
```

#### 5D.3 — Custom Node Components

**Create file:** `packages/dashboard/src/components/canvas/nodes/TriggerNode.jsx`

```
┌─────────────────┐
│  ⏰ Schedule      │
│  9am Mon-Fri     │
└─────────────────┘
```
- Rounded rectangle with `bg-card border border-border`
- Icon (from lucide-react based on trigger subtype) + label
- Subtle left border accent color: `border-l-2 border-l-blue`
- Connection handles: output only (right side)

**Create file:** `packages/dashboard/src/components/canvas/nodes/ToolNode.jsx`

```
┌─────────────────┐
│  📧 Read Emails   │
│  Gmail            │
└─────────────────┘
```
- Same base style as TriggerNode
- Left border accent: `border-l-green`
- Connection handles: input (left) + output (right)
- Show tool/service icon (can use emoji or lucide icon)

**Create file:** `packages/dashboard/src/components/canvas/nodes/AINode.jsx`

```
┌─────────────────┐
│  🤖 Summarize     │
│  gpt-4o-mini     │
│  $0.003          │
└─────────────────┘
```
- Distinct styling: `bg-accent/5 border border-accent/30` (subtle glow effect)
- Left border accent: `border-l-accent`
- Shows model name and cost (from runResults if available)
- Connection handles: input + output
- When running: pulse animation (CSS class `animate-pulse`)

**Create file:** `packages/dashboard/src/components/canvas/nodes/LogicNode.jsx`

```
    ◇ Is Negative?
   ╱               ╲
  yes               no
```
- Diamond-shaped or distinct visual (can use a rotated square via CSS transform, or just a distinct color)
- Left border accent: `border-l-yellow`
- Multiple output handles (for branch paths)

**Create file:** `packages/dashboard/src/components/canvas/nodes/OutputNode.jsx`

- Simple terminal node with `border-l-purple`
- Shows output preview text (truncated)

#### 5D.4 — Node Config Panel

**Create file:** `packages/dashboard/src/components/canvas/NodeConfigPanel.jsx`

**Purpose:** Right-side slide-in panel for configuring a clicked node.

**Props:**
```javascript
{
  node: {id, type, label, config},
  onSave: (nodeId, updatedConfig) => void,
  onClose: () => void,
}
```

**Renders different forms based on node.type:**

- `trigger/schedule`: Cron expression input (with human-readable preview: "Every weekday at 9am")
- `trigger/webhook`: Shows the webhook URL (read-only, auto-generated)
- `tool/mcp`: MCP server selector dropdown, tool selector, parameter inputs
- `tool/http`: URL input, method dropdown, headers key-value editor, body textarea
- `ai/transform`, `ai/generate`: Model selector, prompt textarea, temperature slider, cost cap input
- `ai/decide`: Model selector, prompt textarea, output options list
- `ai/guard`: Guardrail type selector, threshold input, action dropdown (block/warn)
- `logic/branch`: Condition expression input
- `logic/loop`: Input array field selector

**Styling:** Fixed-width panel (380px), slides in from right. `bg-sidebar border-l border-border`. Close button (X) top-right. Save button at bottom.

#### 5D.5 — Workflows List Page

**Create file:** `packages/dashboard/src/components/pages/WorkflowsPage.jsx`

**Layout:**

```
┌─ Header ──────────────────────────────────────────────┐
│  Workflows                                             │
│  AI-powered automations that run on your schedule.    │
│                                          [+ New]      │
└────────────────────────────────────────────────────────┘

┌─ Workflow Cards Grid (2 columns) ─────────────────────┐
│  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │ ⚡ Morning Digest    │  │ 🔍 Lead Research        │ │
│  │ ⏰→📧→🤖→💬          │  │ 🔗→🤖→📧               │ │
│  │ Active · $0.09/wk   │  │ Paused · $0.32/wk       │ │
│  │ Last: 2h ago        │  │ Last: 1d ago            │ │
│  └─────────────────────┘  └─────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

**Data:** Fetch `GET /api/workflows` via usePolling. Fetch `GET /api/workflows/runs/recent` for run stats.

**Each card shows:**
- Icon + name
- Mini node sequence (just the type emojis in a row, connected by →)
- Status badge (active/inactive/error)
- Cost trend (text, not chart — keep it simple)
- Last run time (relative)
- Click → navigates to WorkflowEditor

**[+ New] button** → opens CreateWorkflowModal

#### 5D.6 — Create Workflow Modal

**Create file:** `packages/dashboard/src/components/canvas/CreateWorkflowModal.jsx`

**Layout:**
```
┌─ Create Workflow ─────────────────────────────────────┐
│                                                        │
│  Describe what you want to automate:                  │
│  ┌────────────────────────────────────────────────┐   │
│  │ Every morning, check my Gmail for new client   │   │
│  │ emails, summarize them, and post a summary     │   │
│  │ to #updates in Slack                           │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│                    [Generate Workflow]                  │
│                                                        │
│  ── or start from a template ──                       │
│                                                        │
│  [📧 Email Digest] [🔗 Webhook] [📊 Data Pipeline]    │
│  [🔍 Content Monitor] [🚨 Alert Responder]            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Behavior:**
- Textarea for NL description
- "Generate Workflow" → `POST /api/workflows/generate` with `{description}` → shows loading state → returns generated workflow → navigates to WorkflowEditor with the generated (unsaved) workflow
- Template buttons → `GET /api/workflows/templates/{name}` → same flow
- Cancel button closes modal

#### 5D.7 — Workflow Editor Page

**Create file:** `packages/dashboard/src/components/pages/WorkflowEditor.jsx`

**Layout:**
```
┌─ Header ──────────────────────────────────────────────┐
│  ← Back   Morning Email Digest          [Run] [Save]  │
│  ┌─ NL bar ──────────────────────────────────────┐    │
│  │ Add a filter step before Slack...              │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
┌─ Graph ──────────────────────┐ ┌─ Config Panel ──────┐
│                               │ │  Configure: AI      │
│  [⏰]→[📧]→[🤖]→[💬]        │ │  Summarize           │
│                               │ │                      │
│  (React Flow canvas)         │ │  Model: gpt-4o-mini  │
│                               │ │  Prompt: [textarea]  │
│                               │ │  Cost cap: $0.05     │
│                               │ │                      │
│                               │ │  [Save] [Test Node]  │
└───────────────────────────────┘ └──────────────────────┘
┌─ Run History ────────────────────────────────────────┐
│  ✅ 2h ago  $0.003  1.2s  7 emails processed         │
│  ✅ 26h ago $0.004  1.5s  4 emails processed         │
│  ❌ 2d ago  $0.001  0.3s  Gmail auth expired          │
└──────────────────────────────────────────────────────┘
```

**State:**
- `workflow`: the workflow object (from URL param or passed from create)
- `selectedNode`: which node's config panel is open
- `runs`: run history for this workflow
- `isRunning`: whether a run is in progress

**Data:**
- Load workflow: `GET /api/workflows/{id}`
- Load runs: `GET /api/workflows/{id}/runs`
- Save: `PATCH /api/workflows/{id}` with updated nodes/edges/config
- Run: `POST /api/workflows/{id}/run` → poll `GET /api/workflows/{id}/runs` until status changes from "running"

**NL command bar:**
- Input at top of editor
- On submit: `POST /api/workflows/generate` with `{description, existing_workflow}` (the LLM modifies the existing workflow based on the instruction)
- Updates the graph visually

#### 5D.8 — Activity Stream (Home Page Update)

**File:** `packages/dashboard/src/components/pages/Overview.jsx`

**Change:** Add an "Activity Stream" section below the existing stat cards. This shows recent workflow runs as a visual timeline.

**Data:** Fetch `GET /api/workflows/runs/recent`

**Each run entry shows:**
- Workflow icon + name
- Status icon (✅, ❌, ⚠️, ⏳)
- Node sequence with status highlights
- Cost + duration
- Time (relative)
- Click → navigates to WorkflowEditor for that workflow

#### 5D.9 — Update Sidebar + App.jsx

**File:** `packages/dashboard/src/components/Sidebar.jsx`

Add to NAV array (insert after 'overview', before 'agents'):
```javascript
{ id: 'workflows', label: 'Workflows', icon: Workflow },
```
Import `Workflow` from lucide-react (or use `Boxes` or `GitBranch` if Workflow doesn't exist — check lucide docs).

**File:** `packages/dashboard/src/App.jsx`

Add imports and route:
```javascript
import WorkflowsPage from './components/pages/WorkflowsPage';
import WorkflowEditor from './components/pages/WorkflowEditor';
// In renderPage():
if (page === 'workflows') return <WorkflowsPage onSelectWorkflow={(wf) => { setSelectedWorkflowId(wf.id); setPage('workflow-editor'); }} />;
if (page === 'workflow-editor' && selectedWorkflowId) return <WorkflowEditor workflowId={selectedWorkflowId} onBack={() => handleNav('workflows')} />;
```

Add `selectedWorkflowId` state variable (same pattern as `selectedAgentId`).

#### 5D.10 — Update api.js

**File:** `packages/dashboard/src/api.js`

Add these exports:

```javascript
export async function getWorkflows() {
  return fetchJSON('/workflows');
}
export async function getWorkflow(id) {
  return fetchJSON(`/workflows/${id}`);
}
export async function createWorkflow(data) {
  const res = await fetch(`${BASE}/workflows`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
  return res.json();
}
export async function updateWorkflow(id, data) {
  const res = await fetch(`${BASE}/workflows/${id}`, {
    method: 'PATCH', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
  return res.json();
}
export async function deleteWorkflow(id) {
  await fetch(`${BASE}/workflows/${id}`, {method: 'DELETE'});
}
export async function runWorkflow(id) {
  const res = await fetch(`${BASE}/workflows/${id}/run`, {method: 'POST'});
  return res.json();
}
export async function getWorkflowRuns(id) {
  return fetchJSON(`/workflows/${id}/runs`);
}
export async function getRecentRuns() {
  return fetchJSON('/workflows/runs/recent');
}
export async function generateWorkflow(description) {
  const res = await fetch(`${BASE}/workflows/generate`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({description}),
  });
  return res.json();
}
```

---

### 5E — Build, Test, Commit

**Model assignment:** Use **Sonnet**

```bash
cd packages/dashboard && npm install @xyflow/react dagre && npm run build
cd ../.. && .venv/bin/pip install -e packages/server
.venv/bin/oculos up
```

**Test checklist:**
- [ ] Workflows page loads (empty state)
- [ ] Create workflow via API: `curl -X POST localhost:9090/api/workflows -H 'Content-Type: application/json' -d '{"name":"Test","nodes":[{"id":"t1","type":"trigger/manual","label":"Manual"}],"edges":[]}'`
- [ ] Workflow appears in list
- [ ] Click workflow → editor loads with graph
- [ ] Click node → config panel opens
- [ ] Run workflow → run appears in history
- [ ] Activity stream shows on Overview page

Commit: `feat: workflow engine — data model, CRUD API, visual graph editor, node system`

---

## Phase 6: MCP Integration + Branded Nodes

**Model assignment:** Use **Sonnet** for 6A-6C, **Opus** for 6D

### 6A — MCP Client

**Create file:** `packages/server/oculos/engine/mcp_client.py`

**Purpose:** Connect to MCP servers, discover tools, call tools.

**Specification:**
```python
class MCPClient:
    """
    Connects to an MCP server (stdio or SSE transport).

    Methods:
      async connect(server_config: dict) -> None
          server_config: {command: "npx", args: ["-y", "@anthropic/gmail-mcp"], env: {}}
          OR {url: "http://localhost:3001/sse"}

      async list_tools() -> list[dict]
          Returns: [{name, description, inputSchema}]

      async call_tool(tool_name: str, arguments: dict) -> dict
          Returns: {content: [...]}  (MCP tool result)

      async disconnect() -> None
    """
```

Use the `mcp` Python package: add `"mcp>=1.0.0"` to pyproject.toml dependencies.

### 6B — Connections management

**Add to db.py — new table:**

```sql
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'mcp',        -- 'mcp' for now
    config TEXT NOT NULL DEFAULT '{}',        -- JSON: MCP server config
    status TEXT NOT NULL DEFAULT 'disconnected', -- 'connected', 'disconnected', 'error'
    discovered_tools TEXT NOT NULL DEFAULT '[]', -- JSON: list of discovered tool names
    icon TEXT DEFAULT '🔧',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**API routes — Create file:** `packages/server/oculos/api/connections.py`

```
GET    /api/connections                 → list all connections
POST   /api/connections                 → add new connection (auto-discovers tools)
POST   /api/connections/{id}/refresh    → re-discover tools
DELETE /api/connections/{id}            → remove connection
```

### 6C — Connections Page (Dashboard)

**Create file:** `packages/dashboard/src/components/pages/ConnectionsPage.jsx`

Shows connected MCP servers with:
- Name + icon
- Status dot (green/red)
- Number of discovered tools
- Tool list (expandable)
- Add connection form (name, command/URL, env vars)
- Refresh + Delete buttons

Add to Sidebar nav: `{ id: 'connections', label: 'Connections', icon: Plug }`

### 6D — Branded Node Mapping

**Model assignment:** Use **Opus**

When a connection is added and tools discovered, map tool names to branded node presentations:

```python
# packages/server/oculos/engine/branding.py
KNOWN_SERVICES = {
    "gmail": {"icon": "📧", "label": "Gmail", "color": "red"},
    "slack": {"icon": "💬", "label": "Slack", "color": "purple"},
    "notion": {"icon": "📝", "label": "Notion", "color": "primary"},
    "github": {"icon": "🐙", "label": "GitHub", "color": "primary"},
    "sheets": {"icon": "📊", "label": "Google Sheets", "color": "green"},
    # ... extensible
}

def brand_connection(connection_name: str, tools: list[str]) -> dict:
    """
    Given a connection name (e.g. "gmail-mcp") and its tools,
    return branding info for the UI: icon, label, color.
    Falls back to generic 🔧 if unknown.
    """
```

Dashboard node components use this branding to show Gmail/Slack/etc logos instead of generic "MCP Tool" label.

---

## Phase 7: Templates + Community

**Model assignment:** Use **Haiku** for 7A-7B, **Sonnet** for 7C

### 7A — YAML/JSON Export/Import

**File:** `packages/server/oculos/api/workflows.py`

Add endpoints:
```
GET  /api/workflows/{id}/export  → returns workflow as YAML
POST /api/workflows/import       → accepts YAML, creates workflow
```

### 7B — CLI Command

**File:** `packages/server/oculos/cli.py`

Add command:
```bash
oculos import <file_or_url>
# Reads YAML file or fetches from URL, POSTs to /api/workflows/import
```

### 7C — Template Gallery on oculos.dev

**Model assignment:** Use **Sonnet**

Add a `/templates` page to oculos.dev showing the starter templates with:
- Visual preview (screenshot of the workflow graph)
- Description
- "Import" button with copy-paste CLI command
- Category tags

---

## Model Assignment Summary

| Phase | Task | Model | Why |
|-------|------|-------|-----|
| **4** | Auth + Settings (all) | **Sonnet** | Straightforward CRUD, OAuth flows, forms — well-specified patterns |
| **5A** | Workflow data model + CRUD API | **Sonnet** | Standard DB tables, Pydantic models, REST endpoints |
| **5B** | Workflow execution engine | **Opus** | Complex async orchestration, DAG traversal, error handling, state management |
| **5C** | NL-to-workflow generator | **Opus** | Prompt engineering, template matching strategy, LLM integration design |
| **5D** | Dashboard visual graph + pages | **Sonnet** | React components with precise specs, React Flow integration |
| **5E** | Build + test + commit | **Sonnet** | Mechanical — run commands, verify output |
| **6A** | MCP client | **Sonnet** | Well-defined protocol, library usage |
| **6B** | Connections DB + API | **Sonnet** | Standard CRUD |
| **6C** | Connections page (dashboard) | **Sonnet** | React component with clear spec |
| **6D** | Branded node mapping | **Opus** | Design decision about abstraction layer |
| **7A** | YAML export/import | **Haiku** | Simple serialization |
| **7B** | CLI command | **Haiku** | Simple click command |
| **7C** | Template gallery on website | **Sonnet** | Next.js page with components |

### Recommended Build Order with Model Switching

```
1. Switch to Sonnet → Build Phase 4 (Auth + Settings)
   "Build Phase 4 from BUILD_PLAN.md — sections 4.1 through 4.11"

2. Stay on Sonnet → Build Phase 5A (Workflow data model + CRUD)
   "Build Phase 5A from BUILD_PLAN.md — sections 5A.1 through 5A.4"

3. Switch to Opus → Build Phase 5B (Execution engine)
   "Build Phase 5B from BUILD_PLAN.md — section 5B.1 and 5B.2"

4. Stay on Opus → Build Phase 5C (NL generator)
   "Build Phase 5C from BUILD_PLAN.md — the planner and 5 starter templates"

5. Switch to Sonnet → Build Phase 5D (Dashboard visual graph + pages)
   "Build Phase 5D from BUILD_PLAN.md — sections 5D.1 through 5D.9"

6. Stay on Sonnet → Build Phase 5E (Build, test, commit)
   "Build and test Phase 5 from BUILD_PLAN.md — section 5E"

7. Stay on Sonnet → Build Phase 6A-6C (MCP client + connections)
   "Build Phase 6A, 6B, 6C from BUILD_PLAN.md"

8. Switch to Opus → Build Phase 6D (Branded node mapping)
   "Build Phase 6D from BUILD_PLAN.md"

9. Switch to Haiku → Build Phase 7A-7B (Export/import + CLI)
   "Build Phase 7A and 7B from BUILD_PLAN.md"

10. Switch to Sonnet → Build Phase 7C (Template gallery)
    "Build Phase 7C from BUILD_PLAN.md"
```

### Cost Optimization Note

- **Opus** is used for only 3 tasks (5B, 5C, 6D) — the architecturally complex ones
- **Sonnet** handles the bulk (~70% of work) — standard implementation
- **Haiku** handles the simplest tasks (~5%) — boilerplate and serialization
- This minimizes Opus spend while ensuring quality where it matters most
