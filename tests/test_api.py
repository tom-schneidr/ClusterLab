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
