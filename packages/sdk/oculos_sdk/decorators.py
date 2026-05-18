"""Decorators for instrumenting agent functions."""

from __future__ import annotations

import functools
import time
import uuid
from typing import Any, Callable

from oculos_sdk.types import TraceEventType


def track(oculos_client=None, event_type: TraceEventType = TraceEventType.agent_start):
    """Decorator to track function execution as a trace event.

    Usage:
        from oculos_sdk import Oculos, track

        ax = Oculos(server="http://localhost:9090")
        ax.register(name="my-agent")

        @track(ax)
        def my_function(prompt):
            return llm.generate(prompt)
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            client = oculos_client
            if client is None:
                return func(*args, **kwargs)

            trace_id = str(uuid.uuid4())
            start = time.perf_counter()

            # Send start event
            client._send_trace_event(
                trace_id=trace_id,
                event_type=TraceEventType.agent_start,
                data={"function": func.__name__},
            )

            try:
                result = func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start) * 1000

                # Send complete event
                client._send_trace_event(
                    trace_id=trace_id,
                    event_type=TraceEventType.agent_complete,
                    data={
                        "function": func.__name__,
                        "result_preview": str(result)[:200] if result else None,
                    },
                    duration_ms=duration_ms,
                )

                return result

            except Exception as e:
                duration_ms = (time.perf_counter() - start) * 1000
                client._send_trace_event(
                    trace_id=trace_id,
                    event_type=TraceEventType.error,
                    data={"function": func.__name__, "error": str(e)},
                    duration_ms=duration_ms,
                )
                raise

        return wrapper

    # Allow @track(client) or @track(client, event_type=...)
    if callable(oculos_client):
        # Called as @track without arguments — not supported, need client
        raise TypeError("@track requires an OculOS client: @track(oculos_client)")

    return decorator


def track_async(oculos_client=None, event_type: TraceEventType = TraceEventType.agent_start):
    """Async version of @track decorator."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            client = oculos_client
            if client is None:
                return await func(*args, **kwargs)

            trace_id = str(uuid.uuid4())
            start = time.perf_counter()

            client._send_trace_event(
                trace_id=trace_id,
                event_type=TraceEventType.agent_start,
                data={"function": func.__name__},
            )

            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start) * 1000

                client._send_trace_event(
                    trace_id=trace_id,
                    event_type=TraceEventType.agent_complete,
                    data={
                        "function": func.__name__,
                        "result_preview": str(result)[:200] if result else None,
                    },
                    duration_ms=duration_ms,
                )

                return result

            except Exception as e:
                duration_ms = (time.perf_counter() - start) * 1000
                client._send_trace_event(
                    trace_id=trace_id,
                    event_type=TraceEventType.error,
                    data={"function": func.__name__, "error": str(e)},
                    duration_ms=duration_ms,
                )
                raise

        return wrapper

    return decorator
