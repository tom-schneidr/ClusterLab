from __future__ import annotations

from pathlib import Path

from clusterlab.config import load_settings


def test_settings_defaults(monkeypatch, tmp_path) -> None:
    for key in [
        "CLUSTERLAB_HOST",
        "CLUSTERLAB_PORT",
        "CLUSTERLAB_DATA_DIR",
        "CLUSTERLAB_CORS_ORIGINS",
        "CLUSTERLAB_LLM_TIMEOUT_SECONDS",
        "FREEROUTER_BASE_URL",
        "FREEROUTER_API_KEY",
        "FREEROUTER_MODEL",
        "CLUSTERLAB_LLM_MODE",
    ]:
        monkeypatch.delenv(key, raising=False)

    settings = load_settings(root=tmp_path)

    assert settings.host == "127.0.0.1"
    assert settings.port == 8765
    assert settings.data_dir == tmp_path / "data"
    assert settings.freerouter_base_url == "http://localhost:8000/v1"
    assert settings.llm_mode == "live"
    assert "http://127.0.0.1:8765" in settings.cors_origins


def test_settings_env_overrides(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLUSTERLAB_HOST", "0.0.0.0")
    monkeypatch.setenv("CLUSTERLAB_PORT", "9000")
    monkeypatch.setenv("CLUSTERLAB_DATA_DIR", str(tmp_path / "runtime"))
    monkeypatch.setenv("CLUSTERLAB_CORS_ORIGINS", "http://a.test, http://b.test")
    monkeypatch.setenv("CLUSTERLAB_LLM_TIMEOUT_SECONDS", "12.5")
    monkeypatch.setenv("FREEROUTER_BASE_URL", "http://llm.test/v1/")
    monkeypatch.setenv("FREEROUTER_API_KEY", "secret")
    monkeypatch.setenv("FREEROUTER_MODEL", "test-model")
    monkeypatch.setenv("CLUSTERLAB_LLM_MODE", " OFFLINE-DEMO ")

    settings = load_settings(root=Path("unused"))

    assert settings.host == "0.0.0.0"
    assert settings.port == 9000
    assert settings.data_dir == tmp_path / "runtime"
    assert settings.cors_origins == ["http://a.test", "http://b.test"]
    assert settings.llm_timeout_seconds == 12.5
    assert settings.freerouter_base_url == "http://llm.test/v1"
    assert settings.freerouter_api_key == "secret"
    assert settings.llm_mode == "offline-demo"
    assert settings.freerouter_model == "test-model"
