from __future__ import annotations

from fastapi.testclient import TestClient

from clusterlab.app_factory import create_app


def test_bootstrap_returns_seeded_local_state(tmp_path) -> None:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/api/bootstrap")

    assert response.status_code == 200
    data = response.json()
    assert data["hats"]
    assert data["topologies"]
    assert data["llm"]["base_url"]


def test_missing_run_returns_404(tmp_path) -> None:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/api/runs/not_a_run")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"


def test_hat_create_update_delete_flow(tmp_path) -> None:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)

    body = {
        "name": "Researcher",
        "role": "Finds useful context.",
        "system_prompt": "Research carefully.",
        "model": "auto",
        "temperature": 0.2,
        "tools": ["web_search"],
        "color": "#42c6ff",
        "icon": "brain",
        "can_write_blackboard": True,
        "can_prompt_hats": False,
    }

    created = client.post("/api/hats", json=body)
    assert created.status_code == 200
    hat_id = created.json()["id"]

    updated = client.put(f"/api/hats/{hat_id}", json={**body, "name": "Senior Researcher"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Senior Researcher"

    deleted = client.delete(f"/api/hats/{hat_id}")
    assert deleted.status_code == 200


def test_topology_create_update_delete_flow(tmp_path) -> None:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    topology = {
        "schema_version": 2,
        "name": "Empty Valid Topology",
        "nodes": [],
        "edges": [],
    }

    created = client.post("/api/topologies", json=topology)
    assert created.status_code == 200
    topology_id = created.json()["id"]

    updated = client.put(f"/api/topologies/{topology_id}", json={**topology, "name": "Renamed"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"

    deleted = client.delete(f"/api/topologies/{topology_id}")
    assert deleted.status_code == 200


def test_invalid_topology_save_returns_structured_422(tmp_path) -> None:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    topology = {
        "schema_version": 2,
        "name": "Broken",
        "nodes": [{"id": "worker", "type": "hat", "hat_id": "worker"}],
        "edges": [{"id": "broken", "source": "worker", "target": "missing", "type": "context"}],
    }

    response = client.post("/api/topologies", json=topology)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_topology"
    assert detail["errors"][0]["code"] == "broken_edge"
