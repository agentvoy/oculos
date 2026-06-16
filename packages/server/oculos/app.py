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

_db: Database | None = None


def get_db() -> Database:
    if _db is None:
        raise RuntimeError("Database not initialized")
    return _db


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db

    db_path = app.state.db_path if hasattr(app.state, "db_path") else None
    _db = Database(db_path)
    await _db.connect()

    from oculos.engine.executor import init_executor
    init_executor(_db)

    yield

    await _db.close()
    _db = None


def create_app(db_path: str | Path | None = None) -> FastAPI:
    app = FastAPI(
        title="OculOS",
        description="Visual workflow orchestrator for AI automations",
        version=__version__,
        lifespan=lifespan,
    )

    if db_path:
        app.state.db_path = db_path

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(AuthMiddleware)

    from oculos.api.status import router as status_router
    from oculos.api.secrets import router as secrets_router
    from oculos.api.auth import router as auth_router
    from oculos.api.settings import router as settings_router
    from oculos.api.workflows import router as workflows_router

    app.include_router(auth_router)
    app.include_router(settings_router)
    app.include_router(status_router)
    app.include_router(secrets_router)
    app.include_router(workflows_router)

    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="dashboard")

    return app
