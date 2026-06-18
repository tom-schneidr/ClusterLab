from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

APP_VERSION = "0.1.0"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_DATA_DIR = "data"
DEFAULT_FREEROUTER_BASE_URL = "http://localhost:8000/v1"
DEFAULT_FREEROUTER_API_KEY = "local"
DEFAULT_FREEROUTER_MODEL = "auto"
DEFAULT_LLM_TIMEOUT_SECONDS = 60.0


@dataclass(frozen=True)
class Settings:
    app_version: str
    host: str
    port: int
    data_dir: Path
    cors_origins: list[str]
    freerouter_base_url: str
    freerouter_api_key: str
    freerouter_model: str
    llm_timeout_seconds: float


def load_settings(*, root: Path | None = None) -> Settings:
    app_root = root or Path.cwd()
    port = int(os.getenv("CLUSTERLAB_PORT") or DEFAULT_PORT)
    host = os.getenv("CLUSTERLAB_HOST") or DEFAULT_HOST
    data_dir = Path(os.getenv("CLUSTERLAB_DATA_DIR") or DEFAULT_DATA_DIR)
    if not data_dir.is_absolute():
        data_dir = app_root / data_dir
    origins = parse_csv(os.getenv("CLUSTERLAB_CORS_ORIGINS") or f"http://127.0.0.1:{port},http://localhost:{port}")
    return Settings(
        app_version=os.getenv("CLUSTERLAB_VERSION") or APP_VERSION,
        host=host,
        port=port,
        data_dir=data_dir,
        cors_origins=origins,
        freerouter_base_url=(os.getenv("FREEROUTER_BASE_URL") or DEFAULT_FREEROUTER_BASE_URL).rstrip("/"),
        freerouter_api_key=os.getenv("FREEROUTER_API_KEY") or DEFAULT_FREEROUTER_API_KEY,
        freerouter_model=os.getenv("FREEROUTER_MODEL") or DEFAULT_FREEROUTER_MODEL,
        llm_timeout_seconds=float(os.getenv("CLUSTERLAB_LLM_TIMEOUT_SECONDS") or DEFAULT_LLM_TIMEOUT_SECONDS),
    )


def parse_csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]
