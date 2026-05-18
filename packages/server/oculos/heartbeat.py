"""Heartbeat monitor — polls agent health endpoints."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx

from oculos.db import Database
from oculos.models import AgentStatus

logger = logging.getLogger("oculos.heartbeat")

POLL_INTERVAL = 30  # seconds
TIMEOUT = 10  # seconds
DEGRADED_THRESHOLD = 2  # consecutive failures before degraded
OFFLINE_THRESHOLD = 3  # consecutive failures before offline


class HeartbeatMonitor:
    def __init__(self, db: Database):
        self.db = db
        self._task: asyncio.Task | None = None
        self._failure_counts: dict[str, int] = {}

    async def start(self) -> None:
        logger.info("Starting heartbeat monitor (interval=%ds)", POLL_INTERVAL)
        self._task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Heartbeat monitor stopped")

    async def _poll_loop(self) -> None:
        while True:
            try:
                await self._poll_all()
            except Exception:
                logger.exception("Error in heartbeat poll")
            await asyncio.sleep(POLL_INTERVAL)

    async def _poll_all(self) -> None:
        agents = await self.db.list_agents()
        tasks = [self._check_agent(agent) for agent in agents if agent.health_url]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _check_agent(self, agent) -> None:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(agent.health_url)

            if resp.status_code == 200:
                self._failure_counts[agent.id] = 0
                await self.db.update_agent_status(
                    agent.id, AgentStatus.healthy, last_seen=datetime.utcnow()
                )
            else:
                await self._record_failure(agent)

        except (httpx.RequestError, httpx.TimeoutException):
            await self._record_failure(agent)

    async def _record_failure(self, agent) -> None:
        count = self._failure_counts.get(agent.id, 0) + 1
        self._failure_counts[agent.id] = count

        if count >= OFFLINE_THRESHOLD:
            status = AgentStatus.offline
        elif count >= DEGRADED_THRESHOLD:
            status = AgentStatus.degraded
        else:
            status = agent.status

        if status != agent.status:
            logger.warning(
                "Agent %s (%s) status: %s -> %s (failures: %d)",
                agent.name, agent.id, agent.status.value, status.value, count,
            )

        await self.db.update_agent_status(agent.id, status)
