"""
Authentication middleware for Oculos.

Auth is OPTIONAL — controlled by environment variables:
  OCULOS_GITHUB_CLIENT_ID + OCULOS_GITHUB_CLIENT_SECRET → enables GitHub OAuth
  OCULOS_GOOGLE_CLIENT_ID + OCULOS_GOOGLE_CLIENT_SECRET → enables Google OAuth

If NO env vars are set → auth is disabled → all requests pass through (local mode).
If ANY provider is configured → auth is enabled → all /api routes require valid session or API key.
"""

from __future__ import annotations

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


# Paths that never require auth
PUBLIC_PATHS = {"/health", "/api/status", "/api/traces", "/api/traces/cost"}
PUBLIC_PREFIXES = ("/auth/", "/assets/", "/favicon")


def _is_public(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    for prefix in PUBLIC_PREFIXES:
        if path.startswith(prefix):
            return True
    # Dashboard static files and root
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

        from oculos.app import get_db

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
