from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from clusterlab.api.routes import create_api_router
from clusterlab.config import load_settings
from clusterlab.storage import ClusterStore


def create_app(*, root: Path | None = None, data_dir: Path | None = None) -> FastAPI:
    app_root = root or Path(__file__).resolve().parent.parent
    load_dotenv(app_root / ".env")
    settings = load_settings(root=app_root)
    static_dir = app_root / "static"
    store = ClusterStore((data_dir or settings.data_dir) / "clusterlab.db")
    store.initialize()

    app = FastAPI(title="ClusterLab", version=settings.app_version)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(static_dir / "index.html")

    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    app.include_router(create_api_router(store, settings=settings))
    return app
