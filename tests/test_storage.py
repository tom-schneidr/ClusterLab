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


def test_run_lifecycle_starts_queued_then_running(tmp_path) -> None:
    store = ClusterStore(tmp_path / "clusterlab.db")
    store.initialize()

    run = store.create_run(topology_id="topology", task="task", blackboard={"goal": "task"})
    assert run["status"] == "queued"

    store.mark_run_running(run["id"])
    assert store.get_run(run["id"])["status"] == "running"
