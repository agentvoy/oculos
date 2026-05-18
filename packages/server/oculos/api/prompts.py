"""Prompt version control API."""
from fastapi import APIRouter, HTTPException
from oculos.app import get_db
from oculos.models import PromptCreate, PromptVersion

router = APIRouter(prefix="/api/agents/{agent_id}/prompts", tags=["prompts"])


@router.get("", response_model=list[PromptVersion])
async def list_prompts(agent_id: str):
    db = get_db()
    agent = await db.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return await db.list_prompts(agent_id)


@router.post("", response_model=PromptVersion, status_code=201)
async def create_or_update_prompt(agent_id: str, body: PromptCreate):
    db = get_db()
    agent = await db.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    prompt = await db.upsert_prompt(agent_id, body.name, body.content)
    await db.log_audit("prompt.update", "prompt", prompt.id,
                       {"agent_id": agent_id, "name": body.name, "version": prompt.version})
    return prompt


@router.post("/{prompt_id}/rollback", response_model=PromptVersion)
async def rollback_prompt(agent_id: str, prompt_id: str):
    db = get_db()
    prompt = await db.rollback_prompt(prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt version not found")
    await db.log_audit("prompt.rollback", "prompt", prompt_id, {"agent_id": agent_id})
    return prompt


@router.delete("/{prompt_id}", status_code=204)
async def delete_prompt(agent_id: str, prompt_id: str):
    db = get_db()
    deleted = await db.delete_prompt(prompt_id)
    if not deleted:
        raise HTTPException(404, "Prompt not found")
    await db.log_audit("prompt.delete", "prompt", prompt_id, {"agent_id": agent_id})
