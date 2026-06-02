from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LlmResult:
    content: str
    usage: dict[str, Any] = field(default_factory=dict)
    cost_usd: float = 0.0
    provider_status: str = "mock"
    error: str = ""


def default_model() -> str:
    return os.getenv("FREEROUTER_MODEL") or os.getenv("OPENAI_MODEL") or "auto"


def base_url() -> str:
    return (
        os.getenv("FREEROUTER_BASE_URL")
        or os.getenv("OPENAI_BASE_URL")
        or "http://localhost:8000/v1"
    ).rstrip("/")


def api_key() -> str:
    return os.getenv("FREEROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or "local"


def call_llm(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
) -> LlmResult:
    payload = {
        "model": model or default_model(),
        "messages": messages,
        "temperature": temperature,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url()}/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key()}",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        usage = data.get("usage") or {}
        return LlmResult(
            content=(data.get("choices") or [{}])[0].get("message", {}).get("content", ""),
            usage=usage,
            cost_usd=0.0,
            provider_status=f"live:{round((time.perf_counter() - started) * 1000)}ms",
        )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, IndexError, json.JSONDecodeError) as exc:
        return LlmResult(
            content="",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            cost_usd=0.0,
            provider_status="fallback",
            error=str(exc),
        )
