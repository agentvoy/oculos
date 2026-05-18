"""Agent topology — derive relationship graph from shared traces."""
from fastapi import APIRouter
from oculos.app import get_db

router = APIRouter(prefix="/api/topology", tags=["topology"])


@router.get("")
async def get_topology():
    db = get_db()
    return await db.get_topology()
