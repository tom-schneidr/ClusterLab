from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, TypeAlias

from clusterlab.defaults import DEFAULT_HATS, DEFAULT_TOPOLOGY

JsonObject: TypeAlias = dict[str, Any]

MIGRATIONS: tuple[tuple[str, str], ...] = (
    (
        "0001_initial_schema",
        """
        create table if not exists hats (
            id text primary key,
            data_json text not null,
            updated_at text not null
        );
        create table if not exists topologies (
            id text primary key,
            name text not null,
            data_json text not null,
            updated_at text not null
        );
        create table if not exists runs (
            id text primary key,
            topology_id text not null,
            status text not null,
            task text not null,
            blackboard_json text not null,
            final_result text not null,
            created_at text not null,
            updated_at text not null
        );
        create table if not exists run_events (
            id integer primary key autoincrement,
            run_id text not null,
            seq integer not null,
            event_type text not null,
            hat_id text,
            hat_name text,
            prompt text not null default '',
            output text not null default '',
            blackboard_before_json text not null default '{}',
            blackboard_after_json text not null default '{}',
            metadata_json text not null default '{}',
            created_at text not null
        );
        create index if not exists idx_runs_created_at on runs(created_at desc);
        create index if not exists idx_run_events_run_seq on run_events(run_id, seq);
        """,
    ),
)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class ClusterStore:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    def connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def initialize(self) -> None:
        with self.connect() as conn:
            self._migrate(conn)
            for hat in DEFAULT_HATS:
                self._seed_hat_conn(conn, hat)
            default_row = conn.execute(
                "select data_json from topologies where id = ?", (DEFAULT_TOPOLOGY["id"],)
            ).fetchone()
            default_data = json.loads(default_row["data_json"]) if default_row else {}
            if default_data.get("schema_version") != DEFAULT_TOPOLOGY["schema_version"]:
                self._save_topology_conn(conn, DEFAULT_TOPOLOGY)

    def _migrate(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            create table if not exists schema_migrations (
                version text primary key,
                applied_at text not null
            )
            """
        )
        applied = {row["version"] for row in conn.execute("select version from schema_migrations").fetchall()}
        for version, sql in MIGRATIONS:
            if version in applied:
                continue
            conn.executescript(sql)
            conn.execute(
                "insert into schema_migrations (version, applied_at) values (?, ?)",
                (version, now_iso()),
            )

    def list_hats(self) -> list[JsonObject]:
        with self.connect() as conn:
            rows = conn.execute("select data_json from hats order by id").fetchall()
        return [json.loads(row["data_json"]) for row in rows]

    def save_hat(self, data: JsonObject) -> JsonObject:
        if not data.get("id"):
            data["id"] = slug_id(data.get("name") or "hat")
        with self.connect() as conn:
            self._save_hat_conn(conn, data)
        return data

    def _save_hat_conn(self, conn: sqlite3.Connection, data: JsonObject) -> None:
        data = dict(data)
        data["updated_at"] = now_iso()
        conn.execute(
            """
            insert into hats (id, data_json, updated_at)
            values (?, ?, ?)
            on conflict(id) do update set data_json=excluded.data_json, updated_at=excluded.updated_at
            """,
            (data["id"], json.dumps(data, sort_keys=True), data["updated_at"]),
        )

    def _seed_hat_conn(self, conn: sqlite3.Connection, data: JsonObject) -> None:
        """Insert a built-in hat without overwriting a user's local customisation."""
        data = dict(data)
        data["updated_at"] = now_iso()
        conn.execute(
            """
            insert into hats (id, data_json, updated_at)
            values (?, ?, ?)
            on conflict(id) do nothing
            """,
            (data["id"], json.dumps(data, sort_keys=True), data["updated_at"]),
        )

    def delete_hat(self, hat_id: str) -> None:
        with self.connect() as conn:
            conn.execute("delete from hats where id = ?", (hat_id,))

    def list_topologies(self) -> list[JsonObject]:
        with self.connect() as conn:
            rows = conn.execute("select data_json from topologies order by updated_at desc").fetchall()
        return [json.loads(row["data_json"]) for row in rows]

    def get_topology(self, topology_id: str) -> JsonObject | None:
        with self.connect() as conn:
            row = conn.execute("select data_json from topologies where id = ?", (topology_id,)).fetchone()
        return json.loads(row["data_json"]) if row else None

    def save_topology(self, data: JsonObject) -> JsonObject:
        if not data.get("id"):
            data["id"] = f"topology_{uuid.uuid4().hex[:8]}"
        with self.connect() as conn:
            self._save_topology_conn(conn, data)
        return data

    def _save_topology_conn(self, conn: sqlite3.Connection, data: JsonObject) -> None:
        data = dict(data)
        data["updated_at"] = now_iso()
        conn.execute(
            """
            insert into topologies (id, name, data_json, updated_at)
            values (?, ?, ?, ?)
            on conflict(id) do update set
                name=excluded.name,
                data_json=excluded.data_json,
                updated_at=excluded.updated_at
            """,
            (
                data["id"],
                data.get("name") or data["id"],
                json.dumps(data, sort_keys=True),
                data["updated_at"],
            ),
        )

    def delete_topology(self, topology_id: str) -> None:
        with self.connect() as conn:
            conn.execute("delete from topologies where id = ?", (topology_id,))

    def create_run(
        self,
        *,
        topology_id: str,
        task: str,
        blackboard: JsonObject,
    ) -> JsonObject:
        run = {
            "id": f"run_{uuid.uuid4().hex[:10]}",
            "topology_id": topology_id,
            "status": "queued",
            "task": task,
            "blackboard": blackboard,
            "final_result": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        with self.connect() as conn:
            conn.execute(
                """
                insert into runs
                    (id, topology_id, status, task, blackboard_json, final_result, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run["id"],
                    topology_id,
                    run["status"],
                    task,
                    json.dumps(blackboard, sort_keys=True),
                    "",
                    run["created_at"],
                    run["updated_at"],
                ),
            )
        return run

    def mark_run_running(self, run_id: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "update runs set status = 'running', updated_at = ? where id = ? and status = 'queued'",
                (now_iso(), run_id),
            )

    def update_run(self, run_id: str, *, status: str, blackboard: JsonObject, final_result: str) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                update runs
                set status = ?, blackboard_json = ?, final_result = ?, updated_at = ?
                where id = ?
                """,
                (status, json.dumps(blackboard, sort_keys=True), final_result, now_iso(), run_id),
            )

    def mark_run_stopped(self, run_id: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "update runs set status = 'stopped', updated_at = ? where id = ?",
                (now_iso(), run_id),
            )

    def mark_run_failed(self, run_id: str, *, error: str = "") -> None:
        final_result = error or "Run failed before producing a final result."
        with self.connect() as conn:
            conn.execute(
                """
                update runs
                set status = 'failed',
                    final_result = case when final_result = '' then ? else final_result end,
                    updated_at = ?
                where id = ?
                """,
                (final_result, now_iso(), run_id),
            )

    def get_run(self, run_id: str) -> JsonObject | None:
        with self.connect() as conn:
            row = conn.execute("select * from runs where id = ?", (run_id,)).fetchone()
        if not row:
            return None
        return run_from_row(row)

    def list_runs(self, limit: int = 20) -> list[JsonObject]:
        with self.connect() as conn:
            rows = conn.execute("select * from runs order by created_at desc limit ?", (limit,)).fetchall()
        return [run_from_row(row) for row in rows]

    def append_event(
        self,
        *,
        run_id: str,
        seq: int,
        event_type: str,
        hat_id: str | None = None,
        hat_name: str | None = None,
        prompt: str = "",
        output: str = "",
        blackboard_before: JsonObject | None = None,
        blackboard_after: JsonObject | None = None,
        metadata: JsonObject | None = None,
    ) -> JsonObject:
        event = {
            "run_id": run_id,
            "seq": seq,
            "event_type": event_type,
            "hat_id": hat_id,
            "hat_name": hat_name,
            "prompt": prompt,
            "output": output,
            "blackboard_before": blackboard_before or {},
            "blackboard_after": blackboard_after or {},
            "metadata": metadata or {},
            "created_at": now_iso(),
        }
        with self.connect() as conn:
            conn.execute(
                """
                insert into run_events
                    (run_id, seq, event_type, hat_id, hat_name, prompt, output,
                     blackboard_before_json, blackboard_after_json, metadata_json, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    seq,
                    event_type,
                    hat_id,
                    hat_name,
                    prompt,
                    output,
                    json.dumps(event["blackboard_before"], sort_keys=True),
                    json.dumps(event["blackboard_after"], sort_keys=True),
                    json.dumps(event["metadata"], sort_keys=True),
                    event["created_at"],
                ),
            )
        return event

    def list_events(self, run_id: str) -> list[JsonObject]:
        with self.connect() as conn:
            rows = conn.execute("select * from run_events where run_id = ? order by seq asc", (run_id,)).fetchall()
        return [event_from_row(row) for row in rows]


def run_from_row(row: sqlite3.Row) -> JsonObject:
    return {
        "id": row["id"],
        "topology_id": row["topology_id"],
        "status": row["status"],
        "task": row["task"],
        "blackboard": json.loads(row["blackboard_json"] or "{}"),
        "final_result": row["final_result"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def event_from_row(row: sqlite3.Row) -> JsonObject:
    return {
        "id": row["id"],
        "run_id": row["run_id"],
        "seq": row["seq"],
        "event_type": row["event_type"],
        "hat_id": row["hat_id"],
        "hat_name": row["hat_name"],
        "prompt": row["prompt"],
        "output": row["output"],
        "blackboard_before": json.loads(row["blackboard_before_json"] or "{}"),
        "blackboard_after": json.loads(row["blackboard_after_json"] or "{}"),
        "metadata": json.loads(row["metadata_json"] or "{}"),
        "created_at": row["created_at"],
    }


def slug_id(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "_" for ch in value)
    out = "_".join(part for part in out.split("_") if part)
    return out[:60] or f"hat_{uuid.uuid4().hex[:8]}"
