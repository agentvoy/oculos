"""Secrets vault API — encrypted storage for API keys."""
from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, HTTPException
from cryptography.fernet import Fernet
from oculos.app import get_db
from oculos.models import SecretCreate, SecretPublic

router = APIRouter(prefix="/api/secrets", tags=["secrets"])

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet:
        return _fernet
    key_path = Path.home() / ".oculos" / "vault.key"
    if key_path.exists():
        key = key_path.read_bytes()
    else:
        key = Fernet.generate_key()
        key_path.parent.mkdir(parents=True, exist_ok=True)
        key_path.write_bytes(key)
        key_path.chmod(0o600)
    _fernet = Fernet(key)
    return _fernet


def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()


def _to_public(s) -> SecretPublic:
    return SecretPublic(id=s.id, key_name=s.key_name,
                        hint=s.hint, created_at=s.created_at, rotated_at=s.rotated_at)


@router.get("", response_model=list[SecretPublic])
async def list_secrets():
    db = get_db()
    secrets = await db.list_secrets()
    return [_to_public(s) for s in secrets]


@router.post("", response_model=SecretPublic, status_code=201)
async def create_secret(body: SecretCreate):
    db = get_db()
    encrypted = encrypt(body.value)
    secret = await db.create_secret(body.key_name, encrypted, body.hint)
    return _to_public(secret)


@router.post("/{secret_id}/rotate", response_model=SecretPublic)
async def rotate_secret(secret_id: str, body: dict):
    db = get_db()
    new_value = body.get("value")
    if not new_value:
        raise HTTPException(400, "New value required")
    encrypted = encrypt(new_value)
    secret = await db.rotate_secret(secret_id, encrypted)
    if not secret:
        raise HTTPException(404, "Secret not found")
    return _to_public(secret)


@router.get("/{secret_id}/reveal")
async def reveal_secret(secret_id: str):
    db = get_db()
    secret = await db.get_secret(secret_id)
    if not secret:
        raise HTTPException(404, "Secret not found")
    return {"value": decrypt(secret.encrypted_value)}


@router.delete("/{secret_id}", status_code=204)
async def delete_secret(secret_id: str):
    db = get_db()
    deleted = await db.delete_secret(secret_id)
    if not deleted:
        raise HTTPException(404, "Secret not found")
