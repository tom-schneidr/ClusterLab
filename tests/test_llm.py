from __future__ import annotations

import json
import urllib.error

from clusterlab import llm


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def test_call_llm_success(monkeypatch) -> None:
    monkeypatch.setattr(
        llm.urllib.request,
        "urlopen",
        lambda req, timeout: FakeResponse(
            {
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"total_tokens": 3},
            }
        ),
    )

    result = llm.call_llm([{"role": "user", "content": "hello"}])

    assert result.content == "ok"
    assert result.usage["total_tokens"] == 3
    assert result.provider_status.startswith("live:")


def test_call_llm_missing_choices_is_error(monkeypatch) -> None:
    monkeypatch.setattr(llm.urllib.request, "urlopen", lambda req, timeout: FakeResponse({"choices": []}))

    result = llm.call_llm([{"role": "user", "content": "hello"}])

    assert result.provider_status == "error"
    assert "choices" in result.error


def test_call_llm_handles_http_error(monkeypatch) -> None:
    def raise_error(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 500, "server error", hdrs=None, fp=None)

    monkeypatch.setattr(llm.urllib.request, "urlopen", raise_error)

    result = llm.call_llm([{"role": "user", "content": "hello"}])

    assert result.provider_status == "error"
    assert result.content == ""
