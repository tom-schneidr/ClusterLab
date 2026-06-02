from __future__ import annotations

import copy
import json
from typing import Any

from clusterlab.llm import LlmResult, call_llm


POLICIES = {
    "fixed_sequence": "Fixed sequence",
    "supervisor_chooses": "Supervisor chooses next speaker",
    "critic_verifier_gate": "Critic/verifier gate before final answer",
}


def run_cluster(
    *,
    store: Any,
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
    task: str,
    activation_policy: str | None,
    mode: str,
    max_turns: int = 12,
) -> dict[str, Any]:
    policy = activation_policy or topology.get("activation_policy") or "fixed_sequence"
    blackboard = initial_blackboard(task, policy)
    run = store.create_run(
        topology_id=topology["id"],
        task=task,
        activation_policy=policy,
        mode=mode,
        blackboard=blackboard,
    )
    seq = 0
    store.append_event(
        run_id=run["id"],
        seq=seq,
        event_type="run_started",
        output=f"Run started with policy: {POLICIES.get(policy, policy)}",
        blackboard_after=blackboard,
        metadata={"mode": mode, "token_placeholder": True, "cost_placeholder": True},
    )
    seq += 1

    order = activation_order(topology, hats, policy, max_turns=max_turns)
    last_outputs: dict[str, str] = {}

    for step_index, hat_id in enumerate(order, start=1):
        hat = hats.get(hat_id)
        if not hat:
            continue
        before = copy.deepcopy(blackboard)
        prompt = build_prompt(hat, blackboard, last_outputs, topology, step_index)
        result = invoke_hat(hat, prompt, blackboard, mode=mode)
        output = result.content or mock_hat_output(hat, blackboard, step_index)
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

        if should_emit_supervisor_decision(policy, hat, step_index):
            decision_before = copy.deepcopy(blackboard)
            decision = supervisor_decision(topology, hats, blackboard, last_outputs, step_index)
            blackboard.setdefault("decisions", []).append(decision)
            store.append_event(
                run_id=run["id"],
                seq=seq,
                event_type="supervisor_decision",
                hat_id="executive",
                hat_name="Executive",
                prompt="Routing decision based on current blackboard and topology edges.",
                output=decision,
                blackboard_before=decision_before,
                blackboard_after=blackboard,
                metadata={"blackboard_delta": blackboard_delta(decision_before, blackboard)},
            )
            seq += 1

    final_before = copy.deepcopy(blackboard)
    final_result = compose_final_result(task, blackboard, last_outputs, mode=mode)
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


def initial_blackboard(task: str, policy: str) -> dict[str, Any]:
    return {
        "goal": task,
        "activation_policy": policy,
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


def activation_order(
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
    policy: str,
    *,
    max_turns: int,
) -> list[str]:
    node_ids = [node["hat_id"] for node in topology.get("nodes", []) if node.get("hat_id") in hats]
    if not node_ids:
        return []

    preferred = [
        "executive",
        "context_keeper",
        "planner",
        "worker",
        "critic",
        "verifier",
        "memory_curator",
    ]
    if policy == "fixed_sequence":
        ordered = node_ids
    elif policy == "supervisor_chooses":
        ordered = [hid for hid in preferred if hid in node_ids]
        ordered.extend([hid for hid in node_ids if hid not in ordered])
    elif policy == "critic_verifier_gate":
        base = [hid for hid in ["executive", "context_keeper", "planner", "worker"] if hid in node_ids]
        gates = [hid for hid in ["critic", "verifier"] if hid in node_ids]
        tail = [hid for hid in ["executive", "memory_curator"] if hid in node_ids]
        ordered = base + gates + tail
        ordered.extend([hid for hid in node_ids if hid not in ordered])
    else:
        ordered = node_ids
    return ordered[:max_turns]


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
        f"Topology policy: {blackboard.get('activation_policy')}\n"
        f"Current step: {step_index}\n\n"
        f"Respond as the {hat['name']} hat. Keep output concise but inspectable. "
        "If you recommend a next action, name the target hat and why."
    )


def invoke_hat(
    hat: dict[str, Any],
    prompt: str,
    blackboard: dict[str, Any],
    *,
    mode: str,
) -> LlmResult:
    if mode != "live":
        return LlmResult(
            content=mock_hat_output(hat, blackboard, 0),
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            provider_status="mock",
        )
    result = call_llm(
        [
            {"role": "system", "content": hat.get("system_prompt") or ""},
            {"role": "user", "content": prompt},
        ],
        model=hat.get("model") or "auto",
        temperature=float(hat.get("temperature") or 0.2),
    )
    if result.content:
        return result
    return LlmResult(
        content=mock_hat_output(hat, blackboard, 0),
        usage=result.usage,
        provider_status=result.provider_status,
        error=result.error,
    )


def mock_hat_output(hat: dict[str, Any], blackboard: dict[str, Any], step_index: int) -> str:
    name = str(hat.get("name") or "").lower()
    goal = blackboard.get("goal", "the task")
    if "executive" in name:
        return (
            f"Decision: keep the cluster focused on '{goal}'. "
            "Route through context, plan, worker execution, critic review, verifier check, then memory capture."
        )
    if "planner" in name:
        return (
            "Plan: 1. Clarify the desired outcome. 2. Gather relevant context. "
            "3. Produce the concrete work output. 4. Critique and verify before finalizing."
        )
    if "context" in name:
        return (
            "Context: the cluster is evaluating the goal using the current topology. "
            "Assumption: no external memory has been loaded yet. Open question: what evidence would make the run pass?"
        )
    if "worker" in name:
        return (
            "Work output: a first-pass response has been produced from the plan. "
            "Evidence placeholder: this mock worker used the task, blackboard, and upstream hat outputs."
        )
    if "critic" in name:
        return (
            "Objection: the output may be too generic unless the verifier checks exact success criteria. "
            "Risk: the worker did not cite hard evidence in mock mode."
        )
    if "verifier" in name:
        return (
            "Verification: partial pass. The trace is complete, but real-world correctness still needs tests, citations, or tool output."
        )
    if "memory" in name:
        return (
            "Memory candidate: this topology benefits from explicit critic and verifier gates before final output. "
            "Store with provenance from the current run."
        )
    return f"{hat.get('name', 'Hat')} response for: {goal}"


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


def should_emit_supervisor_decision(policy: str, hat: dict[str, Any], step_index: int) -> bool:
    return policy == "supervisor_chooses" and bool(hat.get("can_prompt_hats")) and step_index <= 4


def supervisor_decision(
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
    blackboard: dict[str, Any],
    last_outputs: dict[str, str],
    step_index: int,
) -> str:
    node_ids = [node["hat_id"] for node in topology.get("nodes", [])]
    if "worker" in node_ids and not blackboard.get("evidence"):
        return "Route next to Worker because the blackboard has no concrete work output yet."
    if "critic" in node_ids and not blackboard.get("objections"):
        return "Route next to Critic because the work output has not been challenged yet."
    if "verifier" in node_ids and not blackboard.get("checks"):
        return "Route next to Verifier because no pass/fail evidence check exists yet."
    return "No additional route required; prepare final synthesis."


def compose_final_result(
    task: str,
    blackboard: dict[str, Any],
    last_outputs: dict[str, str],
    *,
    mode: str,
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
