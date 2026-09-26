from __future__ import annotations

from clusterlab.storage import ClusterStore


def test_initialize_applies_migrations_and_indexes(tmp_path) -> None:
    store = ClusterStore(tmp_path / "clusterlab.db")
    store.initialize()
    store.initialize()

    with store.connect() as conn:
        migrations = conn.execute("select version from schema_migrations").fetchall()
        indexes = {
            row["name"] for row in conn.execute("select name from sqlite_master where type = 'index'").fetchall()
        }

    assert [row["version"] for row in migrations] == ["0001_initial_schema"]
    assert "idx_runs_created_at" in indexes
    assert "idx_run_events_run_seq" in indexes
    assert store.list_hats()
    assert store.list_topologies()


def test_initialize_preserves_user_edits_to_seeded_hats(tmp_path) -> None:
    store = ClusterStore(tmp_path / "clusterlab.db")
    store.initialize()

    worker = next(hat for hat in store.list_hats() if hat["id"] == "worker")
    worker["role"] = "Custom local worker role"
    store.save_hat(worker)

    store.initialize()

    persisted = next(hat for hat in store.list_hats() if hat["id"] == "worker")
    assert persisted["role"] == "Custom local worker role"


def test_run_lifecycle_starts_queued_then_running(tmp_path) -> None:
    store = ClusterStore(tmp_path / "clusterlab.db")
    store.initialize()

    run = store.create_run(topology_id="topology", task="task", blackboard={"goal": "task"})
    assert run["status"] == "queued"

    store.mark_run_running(run["id"])
    assert store.get_run(run["id"])["status"] == "running"


def test_mark_run_stopped_only_transitions_active_runs(tmp_path) -> None:
    store = ClusterStore(tmp_path / "clusterlab.db")
    store.initialize()
    run = store.create_run(topology_id="topology", task="task", blackboard={"goal": "task"})

    assert store.mark_run_stopped(run["id"]) is True
    assert store.get_run(run["id"])["status"] == "stopped"
    assert store.mark_run_stopped(run["id"]) is False
    assert store.get_run(run["id"])["status"] == "stopped"


def test_mark_run_failed_persists_diagnostic_without_overwriting_result(tmp_path) -> None:
    store = ClusterStore(tmp_path / "clusterlab.db")
    store.initialize()
    run = store.create_run(topology_id="topology", task="task", blackboard={"goal": "task"})

    store.mark_run_failed(run["id"], error="provider crashed")
    failed = store.get_run(run["id"])

    assert failed["status"] == "failed"
    assert failed["final_result"] == "provider crashed"

    store.mark_run_failed(run["id"], error="new error")
    assert store.get_run(run["id"])["final_result"] == "provider crashed"
