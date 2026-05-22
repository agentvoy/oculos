"""FastAPI app factory for OculOS."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from oculos import __version__
from oculos.auth import AuthMiddleware
from oculos.db import Database
from oculos.heartbeat import HeartbeatMonitor

_db: Database | None = None
_heartbeat: HeartbeatMonitor | None = None


def get_db() -> Database:
    if _db is None:
        raise RuntimeError("Database not initialized")
    return _db


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db, _heartbeat

    db_path = app.state.db_path if hasattr(app.state, "db_path") else None
    _db = Database(db_path)
    await _db.connect()

    _heartbeat = HeartbeatMonitor(_db)
    await _heartbeat.start()

    yield

    await _heartbeat.stop()
    await _db.close()
    _db = None
    _heartbeat = None


def create_app(db_path: str | Path | None = None) -> FastAPI:
    app = FastAPI(
        title="OculOS",
        description="The control plane for AI agents",
        version=__version__,
        lifespan=lifespan,
    )

    if db_path:
        app.state.db_path = db_path

    # CORS — allow dashboard on any localhost port
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Auth — optional, only active when OAuth env vars are set
    app.add_middleware(AuthMiddleware)

    # Register API routes
    from oculos.api.agents import router as agents_router
    from oculos.api.traces import router as traces_router
    from oculos.api.status import router as status_router
    from oculos.api.prompts import router as prompts_router
    from oculos.api.secrets import router as secrets_router
    from oculos.api.budgets import router as budgets_router, router_all as budgets_all_router
    from oculos.api.topology import router as topology_router
    from oculos.api.alerts import router as alerts_router
    from oculos.api.audit import router as audit_router
    from oculos.api.auth import router as auth_router
    from oculos.api.settings import router as settings_router
    from oculos.api.workflows import router as workflows_router

    app.include_router(auth_router)
    app.include_router(settings_router)
    app.include_router(agents_router)
    app.include_router(traces_router)
    app.include_router(status_router)
    app.include_router(prompts_router)
    app.include_router(secrets_router)
    app.include_router(budgets_router)
    app.include_router(budgets_all_router)
    app.include_router(topology_router)
    app.include_router(alerts_router)
    app.include_router(audit_router)
    app.include_router(workflows_router)

    # Serve dashboard static files if they exist
    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="dashboard")

    return app
