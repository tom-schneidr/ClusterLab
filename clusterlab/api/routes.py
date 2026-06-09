from __future__ import annotations

import os
import threading
import traceback
from typing import Any

from fastapi import APIRouter, HTTPException

from clusterlab.api.schemas import HatDefinitionIn, RunStartIn, TopologyIn
from clusterlab.blackboard import initial_blackboard
from clusterlab.engine import run_cluster
from clusterlab.storage import ClusterStore


def create_api_router(store: ClusterStore) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/bootstrap")
    def bootstrap() -> dict[str, Any]:
        return {
            "hats": store.list_hats(),
            "topologies": store.list_topologies(),
            "runs": store.list_runs(limit=20),
            "llm": {
                "base_url": os.getenv("FREEROUTER_BASE_URL")
                or "http://localhost:8000/v1",
                "default_model": os.getenv("FREEROUTER_MODEL")
                or "auto",
            },
        }

    @router.get("/hats")
    def list_hats() -> list[dict[str, Any]]:
        return store.list_hats()

    @router.post("/hats")
    def create_hat(body: HatDefinitionIn) -> dict[str, Any]:
        return store.save_hat(body.model_dump())

    @router.put("/hats/{hat_id}")
    def update_hat(hat_id: str, body: HatDefinitionIn) -> dict[str, Any]:
        data = body.model_dump()
        data["id"] = hat_id
        return store.save_hat(data)

    @router.delete("/hats/{hat_id}")
    def delete_hat(hat_id: str) -> dict[str, str]:
        store.delete_hat(hat_id)
        return {"status": "ok"}

    @router.get("/topologies")
    def list_topologies() -> list[dict[str, Any]]:
        return store.list_topologies()

    @router.post("/topologies")
    def create_topology(body: TopologyIn) -> dict[str, Any]:
        return store.save_topology(body.model_dump())

    @router.put("/topologies/{topology_id}")
    def update_topology(topology_id: str, body: TopologyIn) -> dict[str, Any]:
        data = body.model_dump()
        data["id"] = topology_id
        return store.save_topology(data)

    @router.delete("/topologies/{topology_id}")
    def delete_topology(topology_id: str) -> dict[str, str]:
        store.delete_topology(topology_id)
        return {"status": "ok"}

    @router.post("/runs/start")
    def start_run(body: RunStartIn) -> dict[str, Any]:
        topology = store.get_topology(body.topology_id)
        if not topology:
            raise HTTPException(404, detail="topology not found")
        hats = {hat["id"]: hat for hat in store.list_hats()}
        blackboard = initial_blackboard(body.task)
        run = store.create_run(
            topology_id=topology["id"],
            task=body.task,
            blackboard=blackboard,
        )

        def worker() -> None:
            try:
                run_cluster(
                    store=store,
                    topology=topology,
                    hats=hats,
                    task=body.task,
                    max_turns=body.max_turns,
                    run_id=run["id"],
                )
            except Exception:
                traceback.print_exc()
                store.mark_run_failed(run["id"])

        threading.Thread(target=worker, daemon=True).start()
        return {**run, "events": []}

    @router.get("/runs")
    def list_runs() -> list[dict[str, Any]]:
        return store.list_runs(limit=50)

    @router.get("/runs/{run_id}")
    def get_run(run_id: str) -> dict[str, Any]:
        run = store.get_run(run_id)
        if not run:
            raise HTTPException(404, detail="run not found")
        run["events"] = store.list_events(run_id)
        return run

    @router.post("/runs/{run_id}/stop")
    def stop_run(run_id: str) -> dict[str, str]:
        store.mark_run_stopped(run_id)
        return {"status": "stopped"}

    return router
