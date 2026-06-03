from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from clusterlab.defaults import DEFAULT_HATS, DEFAULT_TOPOLOGY


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
            conn.executescript(
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
                """
            )
            for hat in DEFAULT_HATS:
                self._save_hat_conn(conn, hat)
            default_row = conn.execute(
                "select data_json from topologies where id = ?", (DEFAULT_TOPOLOGY["id"],)
            ).fetchone()
            default_data = json.loads(default_row["data_json"]) if default_row else {}
            if default_data.get("schema_version") != DEFAULT_TOPOLOGY["schema_version"]:
                self._save_topology_conn(conn, DEFAULT_TOPOLOGY)

    def list_hats(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute("select data_json from hats order by id").fetchall()
        return [json.loads(row["data_json"]) for row in rows]

    def save_hat(self, data: dict[str, Any]) -> dict[str, Any]:
        if not data.get("id"):
            data["id"] = slug_id(data.get("name") or "hat")
        with self.connect() as conn:
            self._save_hat_conn(conn, data)
        return data

    def _save_hat_conn(self, conn: sqlite3.Connection, data: dict[str, Any]) -> None:
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

    def delete_hat(self, hat_id: str) -> None:
        with self.connect() as conn:
            conn.execute("delete from hats where id = ?", (hat_id,))

    def list_topologies(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute("select data_json from topologies order by updated_at desc").fetchall()
        return [json.loads(row["data_json"]) for row in rows]

    def get_topology(self, topology_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                "select data_json from topologies where id = ?", (topology_id,)
            ).fetchone()
        return json.loads(row["data_json"]) if row else None

    def save_topology(self, data: dict[str, Any]) -> dict[str, Any]:
        if not data.get("id"):
            data["id"] = f"topology_{uuid.uuid4().hex[:8]}"
        with self.connect() as conn:
            self._save_topology_conn(conn, data)
        return data

    def _save_topology_conn(self, conn: sqlite3.Connection, data: dict[str, Any]) -> None:
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
        blackboard: dict[str, Any],
    ) -> dict[str, Any]:
        run = {
            "id": f"run_{uuid.uuid4().hex[:10]}",
            "topology_id": topology_id,
            "status": "running",
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

    def update_run(
        self, run_id: str, *, status: str, blackboard: dict[str, Any], final_result: str
    ) -> None:
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

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute("select * from runs where id = ?", (run_id,)).fetchone()
        if not row:
            return None
        return run_from_row(row)

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "select * from runs order by created_at desc limit ?", (limit,)
            ).fetchall()
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
        blackboard_before: dict[str, Any] | None = None,
        blackboard_after: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
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

    def list_events(self, run_id: str) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "select * from run_events where run_id = ? order by seq asc", (run_id,)
            ).fetchall()
        return [event_from_row(row) for row in rows]


def run_from_row(row: sqlite3.Row) -> dict[str, Any]:
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


def event_from_row(row: sqlite3.Row) -> dict[str, Any]:
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
