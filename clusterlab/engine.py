from __future__ import annotations

import copy
import json
from typing import Any

from clusterlab.llm import LlmResult, call_llm


def run_cluster(
    *,
    store: Any,
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
    task: str,
    max_turns: int = 12,
) -> dict[str, Any]:
    blackboard = initial_blackboard(task)
    run = store.create_run(
        topology_id=topology["id"],
        task=task,
        blackboard=blackboard,
    )
    seq = 0
    store.append_event(
        run_id=run["id"],
        seq=seq,
        event_type="run_started",
        output="Run started.",
        blackboard_after=blackboard,
        metadata={"token_placeholder": True, "cost_placeholder": True},
    )
    seq += 1

    order = turn_order(topology, hats, max_turns=max_turns)
    last_outputs: dict[str, str] = {}

    for step_index, hat_id in enumerate(order, start=1):
        hat = hats.get(hat_id)
        if not hat:
            continue
        before = copy.deepcopy(blackboard)
        prompt = build_prompt(hat, blackboard, last_outputs, topology, step_index)
        result = invoke_hat(hat, prompt)
        output = result.content
        last_outputs[hat_id] = output

        after = copy.deepcopy(before)
        if hat.get("can_write_blackboard", True):
            apply_blackboard_update(after, hat, output)
        else:
            after.setdefault("notes", []).append(
                f"{hat['name']} produced output but is not allowed to write blackboard."
            )

        event_type = event_type_for_hat(hat)
        metadata = {
            "step_index": step_index,
            "usage": result.usage or {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            "estimated_cost_usd": result.cost_usd,
            "provider_status": result.provider_status,
            "llm_error": result.error,
            "blackboard_delta": blackboard_delta(before, after),
        }
        store.append_event(
            run_id=run["id"],
            seq=seq,
            event_type=event_type,
            hat_id=hat_id,
            hat_name=hat["name"],
            prompt=prompt,
            output=output,
            blackboard_before=before,
            blackboard_after=after,
            metadata=metadata,
        )
        seq += 1
        blackboard = after

    final_before = copy.deepcopy(blackboard)
    final_result = compose_final_result(task, blackboard, last_outputs)
    blackboard["final_answer"] = final_result
    store.append_event(
        run_id=run["id"],
        seq=seq,
        event_type="final_result",
        output=final_result,
        blackboard_before=final_before,
        blackboard_after=blackboard,
        metadata={"usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "estimated_cost_usd": 0.0},
    )
    store.update_run(run["id"], status="completed", blackboard=blackboard, final_result=final_result)
    completed = store.get_run(run["id"]) or run
    completed["events"] = store.list_events(run["id"])
    return completed


def initial_blackboard(task: str) -> dict[str, Any]:
    return {
        "goal": task,
        "situation": [],
        "plan": [],
        "assumptions": [],
        "evidence": [],
        "objections": [],
        "checks": [],
        "decisions": [],
        "memory_candidates": [],
        "notes": [],
        "final_answer": "",
    }


def turn_order(
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
    *,
    max_turns: int,
) -> list[str]:
    node_ids = [node["hat_id"] for node in topology.get("nodes", []) if node.get("hat_id") in hats]
    if not node_ids:
        return []

    return node_ids[:max_turns]


def build_prompt(
    hat: dict[str, Any],
    blackboard: dict[str, Any],
    last_outputs: dict[str, str],
    topology: dict[str, Any],
    step_index: int,
) -> str:
    compact_outputs = {
        key: value[:900]
        for key, value in last_outputs.items()
    }
    return (
        f"Cluster task:\n{blackboard['goal']}\n\n"
        f"Current blackboard JSON:\n{json.dumps(blackboard, indent=2)}\n\n"
        f"Recent hat outputs:\n{json.dumps(compact_outputs, indent=2)}\n\n"
        f"Current step: {step_index}\n\n"
        f"Respond as the {hat['name']} hat. Keep output concise but inspectable. "
        "If you recommend a next action, name the target hat and why."
    )


def invoke_hat(
    hat: dict[str, Any],
    prompt: str,
) -> LlmResult:
    return call_llm(
        [
            {"role": "system", "content": hat.get("system_prompt") or ""},
            {"role": "user", "content": prompt},
        ],
        model=hat.get("model") or "auto",
        temperature=float(hat.get("temperature") or 0.2),
    )


def apply_blackboard_update(blackboard: dict[str, Any], hat: dict[str, Any], output: str) -> None:
    name = str(hat.get("name") or "").lower()
    if "executive" in name:
        blackboard.setdefault("decisions", []).append(output)
    elif "planner" in name:
        blackboard.setdefault("plan", []).append(output)
    elif "context" in name:
        blackboard.setdefault("situation", []).append(output)
        blackboard.setdefault("assumptions", []).append("Context Keeper updated the situation model.")
    elif "worker" in name:
        blackboard.setdefault("evidence", []).append(output)
    elif "critic" in name:
        blackboard.setdefault("objections", []).append(output)
    elif "verifier" in name:
        blackboard.setdefault("checks", []).append(output)
    elif "memory" in name:
        blackboard.setdefault("memory_candidates", []).append(output)
    else:
        blackboard.setdefault("notes", []).append(output)


def event_type_for_hat(hat: dict[str, Any]) -> str:
    name = str(hat.get("name") or "").lower()
    if "critic" in name:
        return "critic_objection"
    if "verifier" in name:
        return "verifier_check"
    if "executive" in name:
        return "executive_turn"
    return "hat_turn"


def compose_final_result(
    task: str,
    blackboard: dict[str, Any],
    last_outputs: dict[str, str],
) -> str:
    objections = blackboard.get("objections") or []
    checks = blackboard.get("checks") or []
    evidence = blackboard.get("evidence") or []
    status = "ready with caveats" if objections or checks else "draft"
    return (
        f"Cluster result for task: {task}\n\n"
        f"Status: {status}.\n\n"
        f"Main output:\n{(evidence[-1] if evidence else 'No worker evidence was produced.')}\n\n"
        f"Critic:\n{(objections[-1] if objections else 'No critic objections recorded.')}\n\n"
        f"Verifier:\n{(checks[-1] if checks else 'No verifier checks recorded.')}\n\n"
        "Inspect the Run Analysis trace for every prompt, output, blackboard delta, and token/cost placeholder."
    )


def blackboard_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    delta: dict[str, Any] = {}
    for key, value in after.items():
        if before.get(key) != value:
            if isinstance(value, list) and isinstance(before.get(key), list):
                delta[key] = value[len(before.get(key, [])) :]
            else:
                delta[key] = value
    return delta
