from __future__ import annotations

import threading
import traceback
from typing import Any

from fastapi import APIRouter, HTTPException

from clusterlab.api.schemas import HatDefinitionIn, RunDetail, RunStartIn, RunSummary, TopologyIn
from clusterlab.blackboard import initial_blackboard
from clusterlab.config import Settings
from clusterlab.engine import run_cluster
from clusterlab.storage import ClusterStore
from clusterlab.topology import blocking_topology_errors, validate_topology


def create_api_router(store: ClusterStore, *, settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/bootstrap")
    def bootstrap() -> dict[str, Any]:
        return {
            "hats": store.list_hats(),
            "topologies": store.list_topologies(),
            "runs": store.list_runs(limit=20),
            "llm": {
                "base_url": settings.freerouter_base_url,
                "default_model": settings.freerouter_model,
                "timeout_seconds": settings.llm_timeout_seconds,
            },
            "app": {"version": settings.app_version},
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
        return save_validated_topology(store, body.model_dump())

    @router.put("/topologies/{topology_id}")
    def update_topology(topology_id: str, body: TopologyIn) -> dict[str, Any]:
        data = body.model_dump()
        data["id"] = topology_id
        return save_validated_topology(store, data)

    @router.delete("/topologies/{topology_id}")
    def delete_topology(topology_id: str) -> dict[str, str]:
        store.delete_topology(topology_id)
        return {"status": "ok"}

    @router.post("/runs/start", response_model=RunDetail)
    def start_run(body: RunStartIn) -> dict[str, Any]:
        topology = store.get_topology(body.topology_id)
        if not topology:
            raise not_found("topology", body.topology_id)
        hats = {hat["id"]: hat for hat in store.list_hats()}
        blackboard = initial_blackboard(body.task)
        run = store.create_run(
            topology_id=topology["id"],
            task=body.task,
            blackboard=blackboard,
        )

        def worker() -> None:
            try:
                store.mark_run_running(run["id"])
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

    @router.get("/runs", response_model=list[RunSummary])
    def list_runs() -> list[dict[str, Any]]:
        return store.list_runs(limit=50)

    @router.get("/runs/{run_id}", response_model=RunDetail)
    def get_run(run_id: str) -> dict[str, Any]:
        run = store.get_run(run_id)
        if not run:
            raise not_found("run", run_id)
        run["events"] = store.list_events(run_id)
        return run

    @router.post("/runs/{run_id}/stop")
    def stop_run(run_id: str) -> dict[str, str]:
        store.mark_run_stopped(run_id)
        return {"status": "stopped"}

    return router


def save_validated_topology(store: ClusterStore, data: dict[str, Any]) -> dict[str, Any]:
    hats = {hat["id"]: hat for hat in store.list_hats()}
    errors = blocking_topology_errors(data, hats)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_topology",
                "message": "Topology has blocking validation errors.",
                "errors": errors,
            },
        )
    saved = store.save_topology(data)
    saved["validation"] = validate_topology(saved, hats)
    return saved


def not_found(resource: str, identifier: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "code": "not_found",
            "message": f"{resource} not found",
            "resource": resource,
            "id": identifier,
        },
    )
