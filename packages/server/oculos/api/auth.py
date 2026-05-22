"""
OAuth & session endpoints.

  GET  /auth/providers        → list enabled providers
  GET  /auth/github           → redirect to GitHub OAuth
  GET  /auth/github/callback  → handle GitHub callback, set session cookie
  GET  /auth/google           → redirect to Google OAuth
  GET  /auth/google/callback  → handle Google callback, set session cookie
  GET  /auth/me               → current user info
  POST /auth/logout           → clear session
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, Response

from oculos.app import get_db
from oculos.auth import hash_token, auth_enabled

router = APIRouter(prefix="/auth", tags=["auth"])

GITHUB_CLIENT_ID = os.environ.get("OCULOS_GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("OCULOS_GITHUB_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID = os.environ.get("OCULOS_GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("OCULOS_GOOGLE_CLIENT_SECRET", "")
SESSION_MAX_AGE_DAYS = 30


@router.get("/providers")
async def list_providers():
    return {
        "auth_enabled": auth_enabled(),
        "github": bool(GITHUB_CLIENT_ID),
        "google": bool(GOOGLE_CLIENT_ID),
    }


# ── GitHub OAuth ───────────────────────────────────

@router.get("/github")
async def github_login(request: Request):
    if not GITHUB_CLIENT_ID:
        raise HTTPException(400, "GitHub OAuth not configured")
    callback = str(request.url_for("github_callback"))
    url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={callback}"
        f"&scope=read:user user:email"
    )
    return RedirectResponse(url)


@router.get("/github/callback")
async def github_callback(code: str):
    if not GITHUB_CLIENT_ID:
        raise HTTPException(400, "GitHub OAuth not configured")

    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
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

        # Fetch primary email if not public
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

    session_token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_MAX_AGE_DAYS)
    await db.create_session(user["id"], hash_token(session_token), expires.isoformat())

    resp = RedirectResponse("/", status_code=302)
    resp.set_cookie(
        "oculos_session",
        session_token,
        max_age=SESSION_MAX_AGE_DAYS * 86400,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return resp


# ── Google OAuth ───────────────────────────────────

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
async def google_callback(code: str, request: Request):
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
        "oculos_session",
        session_token,
        max_age=SESSION_MAX_AGE_DAYS * 86400,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return resp


# ── Session ────────────────────────────────────────

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
async def logout(request: Request):
    token = request.cookies.get("oculos_session")
    if token:
        db = get_db()
        session = await db.get_session_by_token_hash(hash_token(token))
        if session:
            await db.delete_session(session["id"])
    resp = Response(status_code=204)
    resp.delete_cookie("oculos_session", path="/")
    return resp
