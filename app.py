from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from clusterlab.engine import run_cluster
from clusterlab.storage import ClusterStore


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
STATIC_DIR = ROOT / "static"

store = ClusterStore(DATA_DIR / "clusterlab.db")
store.initialize()

app = FastAPI(title="ClusterLab", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class HatDefinitionIn(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(default="", max_length=500)
    system_prompt: str = Field(default="", max_length=8000)
    model: str = Field(default="auto", max_length=120)
    temperature: float = Field(default=0.2, ge=0, le=2)
    tools: list[str] = Field(default_factory=list)
    color: str = "#42c6ff"
    icon: str = "brain"
    can_write_blackboard: bool = True
    can_prompt_hats: bool = False


class TopologyIn(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    activation_policy: str = "fixed_sequence"
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class RunStartIn(BaseModel):
    topology_id: str
    task: str = Field(min_length=1, max_length=12000)
    activation_policy: str | None = None
    mode: str = "mock"
    max_turns: int = Field(default=12, ge=1, le=32)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/bootstrap")
def bootstrap() -> dict[str, Any]:
    return {
        "hats": store.list_hats(),
        "topologies": store.list_topologies(),
        "runs": store.list_runs(limit=20),
        "llm": {
            "base_url": os.getenv("FREEROUTER_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or "http://localhost:8000/v1",
            "default_model": os.getenv("FREEROUTER_MODEL")
            or os.getenv("OPENAI_MODEL")
            or "auto",
        },
    }


@app.get("/api/hats")
def list_hats() -> list[dict[str, Any]]:
    return store.list_hats()


@app.post("/api/hats")
def create_hat(body: HatDefinitionIn) -> dict[str, Any]:
    return store.save_hat(body.model_dump())


@app.put("/api/hats/{hat_id}")
def update_hat(hat_id: str, body: HatDefinitionIn) -> dict[str, Any]:
    data = body.model_dump()
    data["id"] = hat_id
    return store.save_hat(data)


@app.delete("/api/hats/{hat_id}")
def delete_hat(hat_id: str) -> dict[str, str]:
    store.delete_hat(hat_id)
    return {"status": "ok"}


@app.get("/api/topologies")
def list_topologies() -> list[dict[str, Any]]:
    return store.list_topologies()


@app.post("/api/topologies")
def create_topology(body: TopologyIn) -> dict[str, Any]:
    return store.save_topology(body.model_dump())


@app.put("/api/topologies/{topology_id}")
def update_topology(topology_id: str, body: TopologyIn) -> dict[str, Any]:
    data = body.model_dump()
    data["id"] = topology_id
    return store.save_topology(data)


@app.delete("/api/topologies/{topology_id}")
def delete_topology(topology_id: str) -> dict[str, str]:
    store.delete_topology(topology_id)
    return {"status": "ok"}


@app.post("/api/runs/start")
def start_run(body: RunStartIn) -> dict[str, Any]:
    topology = store.get_topology(body.topology_id)
    if not topology:
        raise HTTPException(404, detail="topology not found")
    hats = {hat["id"]: hat for hat in store.list_hats()}
    run = run_cluster(
        store=store,
        topology=topology,
        hats=hats,
        task=body.task,
        activation_policy=body.activation_policy or topology.get("activation_policy"),
        mode=body.mode,
        max_turns=body.max_turns,
    )
    return run


@app.get("/api/runs")
def list_runs() -> list[dict[str, Any]]:
    return store.list_runs(limit=50)


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(404, detail="run not found")
    run["events"] = store.list_events(run_id)
    return run


@app.post("/api/runs/{run_id}/stop")
def stop_run(run_id: str) -> dict[str, str]:
    store.mark_run_stopped(run_id)
    return {"status": "stopped"}
