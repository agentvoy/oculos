"""FastAPI middleware for auto-instrumenting agents with OculOS."""

from __future__ import annotations

import os
import time
import uuid
import logging
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from oculos_sdk.client import Oculos
from oculos_sdk.types import TraceEventType

logger = logging.getLogger("oculos_sdk.middleware")

TRACE_HEADER = "X-Oculos-Trace-Id"


class OculosMiddleware(BaseHTTPMiddleware):
    """Auto-instruments a FastAPI app with OculOS.

    Usage:
        from oculos_sdk.middleware import OculosMiddleware
        app.add_middleware(OculosMiddleware)
    """

    def __init__(
        self,
        app,
        server: str | None = None,
        agent_name: str | None = None,
        health_url: str | None = None,
    ):
        super().__init__(app)
        self.server = server or os.environ.get("OCULOS_SERVER", "http://localhost:9090")
        self.agent_name = agent_name or os.environ.get("OCULOS_AGENT_NAME", "unnamed-agent")
        self.health_url = health_url

        self._client = Oculos(server=self.server)
        self._client.register(
            name=self.agent_name,
            health_url=self.health_url,
        )
        logger.info("OculOS middleware initialized (server=%s, agent=%s)", self.server, self.agent_name)

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip health and docs endpoints
        if request.url.path in ("/health", "/docs", "/openapi.json", "/favicon.ico"):
            return await call_next(request)

        trace_id = request.headers.get(TRACE_HEADER, str(uuid.uuid4()))
        start = time.perf_counter()

        # Send start event
        self._client._send_trace_event(
            trace_id=trace_id,
            event_type=TraceEventType.agent_start,
            data={
                "method": request.method,
                "path": request.url.path,
            },
        )

        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start) * 1000

            self._client._send_trace_event(
                trace_id=trace_id,
                event_type=TraceEventType.agent_complete,
                data={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                },
                duration_ms=duration_ms,
            )

            response.headers[TRACE_HEADER] = trace_id
            return response

        except Exception as e:
            duration_ms = (time.perf_counter() - start) * 1000
            self._client._send_trace_event(
                trace_id=trace_id,
                event_type=TraceEventType.error,
                data={
                    "method": request.method,
                    "path": request.url.path,
                    "error": str(e),
                },
                duration_ms=duration_ms,
            )
            raise
