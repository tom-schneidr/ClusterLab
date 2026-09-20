from __future__ import annotations

import copy

from clusterlab import engine
from clusterlab.defaults import DEFAULT_HATS, DEFAULT_TOPOLOGY
from clusterlab.llm import LlmResult
from clusterlab.storage import ClusterStore


def hats_by_id() -> dict:
    return {hat["id"]: hat for hat in DEFAULT_HATS}


def test_default_topology_validates_without_warnings() -> None:
    assert engine.validate_topology(copy.deepcopy(DEFAULT_TOPOLOGY), hats_by_id()) == []


def test_typed_graph_execution_runs_review_revision_and_approval(tmp_path, monkeypatch) -> None:
    store = ClusterStore(tmp_path / "clusterlab.db")
    store.initialize()

    def fake_call_llm(messages, *, model=None, temperature=0.2, max_tokens=900):
        prompt = messages[-1]["content"]
        stage_line = next(line for line in prompt.splitlines() if line.startswith("Current stage:"))
        stage = stage_line.split("/", 1)[1].strip()
        return LlmResult(
            content=f"output for {stage}",
            usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            provider_status="fake",
        )

    monkeypatch.setattr(engine, "call_llm", fake_call_llm)
    run = engine.run_cluster(
        store=store,
        topology=copy.deepcopy(DEFAULT_TOPOLOGY),
        hats=hats_by_id(),
        task="Answer a broad reasoning prompt well.",
    )

    stages = [event["metadata"].get("stage") for event in run["events"] if event["metadata"].get("stage")]
    assert stages == [
        "executive_orientation",
        "context",
        "planning",
        "work",
        "critique",
        "revision",
        "verification",
        "executive_approval",
        "memory",
    ]
    assert run["status"] == "completed"
    assert run["final_result"] == "output for executive_approval"


def test_offline_demo_executes_the_default_cluster_without_a_provider(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CLUSTERLAB_LLM_MODE", "offline-demo")
    store = ClusterStore(tmp_path / "clusterlab.db")
    store.initialize()

    run = engine.run_cluster(
        store=store,
        topology=copy.deepcopy(DEFAULT_TOPOLOGY),
        hats=hats_by_id(),
        task="Demonstrate a reproducible local cluster run.",
    )

    assert run["status"] == "completed"
    assert run["final_result"].startswith("Offline demo result:")
    assert all(event["metadata"].get("provider_status") == "offline-demo" for event in run["events"][1:-1])


def test_validation_warns_when_final_output_has_no_approval_edge() -> None:
    topology = copy.deepcopy(DEFAULT_TOPOLOGY)
    topology["edges"] = [edge for edge in topology["edges"] if edge["id"] != "e_executive_final"]

    messages = [warning["message"] for warning in engine.validate_topology(topology, hats_by_id())]
    assert "Final Output has no approval edge from Executive." in messages


def test_compose_final_result_does_not_use_puzzle_shortcuts() -> None:
    result = engine.compose_final_result(
        "Three boxes are labeled Apples, Oranges, and Mixed. Every label is wrong.",
        {},
        {},
    )

    assert result == ""
