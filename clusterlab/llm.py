from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

from clusterlab.config import load_settings


@dataclass
class LlmResult:
    content: str
    usage: dict[str, Any] = field(default_factory=dict)
    cost_usd: float = 0.0
    provider_status: str = "pending"
    error: str = ""


def default_model() -> str:
    return load_settings().freerouter_model


def base_url() -> str:
    return load_settings().freerouter_base_url


def api_key() -> str:
    return load_settings().freerouter_api_key


def call_llm(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 900,
) -> LlmResult:
    settings = load_settings()
    if settings.llm_mode in {"offline", "offline-demo", "demo"}:
        return offline_demo_result(messages)

    payload = {
        "model": model or default_model(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
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
        with urllib.request.urlopen(req, timeout=settings.llm_timeout_seconds) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        usage = data.get("usage") or {}
        choices = data.get("choices") or []
        if not choices:
            return LlmResult(
                content="",
                usage=usage,
                cost_usd=0.0,
                provider_status="error",
                error="LLM response did not include any choices.",
            )
        return LlmResult(
            content=choices[0].get("message", {}).get("content", ""),
            usage=usage,
            cost_usd=0.0,
            provider_status=f"live:{round((time.perf_counter() - started) * 1000)}ms",
        )
    except (
        urllib.error.URLError,
        urllib.error.HTTPError,
        TimeoutError,
        KeyError,
        IndexError,
        json.JSONDecodeError,
    ) as exc:
        return LlmResult(
            content="",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            cost_usd=0.0,
            provider_status="error",
            error=str(exc),
        )


def offline_demo_result(messages: list[dict[str, str]]) -> LlmResult:
    """Return a deterministic, clearly labelled response for local demonstrations."""
    prompt = messages[-1].get("content", "") if messages else ""
    stage = "hat_turn"
    for line in prompt.splitlines():
        if line.startswith("Current stage:"):
            stage = line.split("/", 1)[-1].strip() or stage
            break

    outputs = {
        "executive_orientation": (
            "Offline demo: define the goal, success criteria, and stopping conditions before delegating work."
        ),
        "context": "Offline demo: record facts, constraints, assumptions, and open questions for the cluster.",
        "planning": "Offline demo: create a concrete task packet with dependencies and acceptance checks.",
        "work": "Offline demo: produce a direct work product with a concise evidence note.",
        "critique": "Offline demo: identify a likely weakness, missing case, or unsupported assumption.",
        "revision": "Offline demo: revise the work product to address the recorded critique.",
        "verification": "Offline demo: verify the revised result against the goal and mark remaining proof gaps.",
        "executive_approval": "Offline demo result: the reviewed work product is approved for local inspection.",
        "memory": "Offline demo: preserve only the durable procedure and its provenance.",
    }
    content = outputs.get(stage, f"Offline demo output for {stage}.")
    return LlmResult(
        content=content,
        usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        cost_usd=0.0,
        provider_status="offline-demo",
    )
