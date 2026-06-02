from __future__ import annotations

import copy
import json
from collections import deque
from typing import Any

from clusterlab.llm import LlmResult, call_llm


EDGE_TYPES: dict[str, str] = {
    "context": "Context flow",
    "delegation": "Task delegation",
    "review": "Review gate",
    "state": "State read/write",
    "escalation": "Escalation or revision",
    "approval": "Approval path",
}

STAGE_INSTRUCTIONS: dict[str, str] = {
    "executive_orientation": (
        "Frame the task for a high-performing generalist cluster. Define the success criteria, "
        "likely benchmark failure modes, and what the rest of the cluster must optimize for."
    ),
    "context": (
        "Extract the relevant facts, constraints, assumptions, and missing information. "
        "Prefer compact structured notes that other hats can use directly."
    ),
    "planning": (
        "Create a concrete task packet. Include the approach, dependencies, acceptance checks, "
        "and what evidence would prove the answer is stronger than a one-shot response."
    ),
    "work": (
        "Execute the task packet directly. Produce the strongest answer or artifact you can, "
        "using the plan and blackboard. Include useful evidence or reasoning, but avoid filler."
    ),
    "critique": (
        "Attack the current work product. Find weak reasoning, hidden assumptions, edge cases, "
        "missing evidence, ambiguity, benchmark traps, and overconfident claims. Be specific."
    ),
    "revision": (
        "Revise the work product using the critic's objections. Preserve what is strong, fix what "
        "is weak, and make the answer more robust for broad benchmark-style evaluation."
    ),
    "verification": (
        "Verify the revised work against the original goal and success criteria. Give a pass/fail "
        "style verdict, cite the strongest evidence available, and name unresolved proof gaps. "
        "Do not merely summarize the answer. Actively search for contradictions. For finite logic "
        "tasks, enumerate each branch/case and check every stated invariant exactly: no duplicated "
        "assignments, no unchanged labels when labels are declared wrong, and no branch that violates "
        "the prompt constraints. Mark FAIL if any branch is inconsistent."
    ),
    "executive_approval": (
        "Make the final decision. Use the plan, work, critique, revision, and verification. "
        "Return the clean final user-facing answer. Before writing the answer, perform one final "
        "constraint audit on the concrete output. If the verifier passed a flawed result, correct it "
        "rather than preserving the flaw. Do not add new optional analysis that was not verified; for "
        "minimal-proof tasks, prefer the smallest correct proof and exact case mapping. Do not expose "
        "internal trace unless it helps."
    ),
    "memory": (
        "Extract only durable lessons, reusable procedures, stable preferences, and provenance. "
        "Avoid storing one-off noise."
    ),
    "hat_turn": "Perform your node's function using the graph context and current blackboard.",
}


def run_cluster(
    *,
    store: Any,
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
    task: str,
    max_turns: int = 12,
) -> dict[str, Any]:
    blackboard = initial_blackboard(task)
    validation = validate_topology(topology, hats)
    stage_plan = build_execution_plan(topology, hats, max_turns=max_turns)
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
        metadata={
            "validation": validation,
            "execution_plan": [
                {"stage": stage["key"], "node_id": stage["node"]["id"]}
                for stage in stage_plan
            ],
        },
    )
    seq += 1

    stage_outputs: dict[str, str] = {}
    node_outputs: dict[str, str] = {}

    for step_index, stage in enumerate(stage_plan, start=1):
        node = stage["node"]
        hat = hats.get(node.get("hat_id"))
        if not hat:
            continue
        before = copy.deepcopy(blackboard)
        edge_context = describe_node_edges(node, topology)
        upstream_outputs = incoming_node_outputs(node, topology, node_outputs)
        prompt = build_prompt(
            hat=hat,
            node=node,
            blackboard=blackboard,
            stage_outputs=stage_outputs,
            upstream_outputs=upstream_outputs,
            topology=topology,
            stage=stage,
            step_index=step_index,
            edge_context=edge_context,
        )
        result = invoke_hat(hat, node, prompt)
        output = result.content
        stage_outputs[stage["key"]] = output
        node_outputs[node["id"]] = output

        after = copy.deepcopy(before)
        if node_allows_blackboard_write(node, hat):
            apply_blackboard_update(after, node, hat, output, stage["key"])
        else:
            after.setdefault("notes", []).append(
                f"{display_name(node, hat)} produced output but is not allowed to write blackboard."
            )
        if result.error:
            after.setdefault("notes", []).append(
                f"{display_name(node, hat)} LLM call failed: {result.error}"
            )

        metadata = {
            "step_index": step_index,
            "stage": stage["key"],
            "node_id": node["id"],
            "node_type": node.get("type") or "hat",
            "edge_context": edge_context,
            "usage": result.usage
            or {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            "estimated_cost_usd": result.cost_usd,
            "provider_status": result.provider_status,
            "llm_error": result.error,
            "blackboard_delta": blackboard_delta(before, after),
        }
        store.append_event(
            run_id=run["id"],
            seq=seq,
            event_type=event_type_for_stage(stage["key"], hat),
            hat_id=hat["id"],
            hat_name=display_name(node, hat),
            prompt=prompt,
            output=output,
            blackboard_before=before,
            blackboard_after=after,
            metadata=metadata,
        )
        seq += 1
        blackboard = after

    final_before = copy.deepcopy(blackboard)
    final_result = compose_final_result(task, blackboard, stage_outputs)
    blackboard["final_answer"] = final_result
    store.append_event(
        run_id=run["id"],
        seq=seq,
        event_type="final_result",
        output=final_result,
        blackboard_before=final_before,
        blackboard_after=blackboard,
        metadata={
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            "estimated_cost_usd": 0.0,
            "validation": validation,
        },
    )
    store.update_run(
        run["id"], status="completed", blackboard=blackboard, final_result=final_result
    )
    completed = store.get_run(run["id"]) or run
    completed["events"] = store.list_events(run["id"])
    return completed


def initial_blackboard(task: str) -> dict[str, Any]:
    return {
        "goal": task,
        "success_criteria": [],
        "situation": [],
        "plan": [],
        "task_packets": [],
        "assumptions": [],
        "work_products": [],
        "revisions": [],
        "evidence": [],
        "objections": [],
        "checks": [],
        "decisions": [],
        "gate_status": [],
        "memory_candidates": [],
        "notes": [],
        "final_answer": "",
    }


def build_execution_plan(
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
    *,
    max_turns: int,
) -> list[dict[str, Any]]:
    roles = {
        "executive": find_hat_node(topology, hats, ["executive"]),
        "context": find_hat_node(topology, hats, ["context"]),
        "planner": find_hat_node(topology, hats, ["planner"]),
        "worker": find_hat_node(topology, hats, ["worker"]),
        "critic": find_hat_node(topology, hats, ["critic"]),
        "verifier": find_hat_node(topology, hats, ["verifier"]),
        "memory": find_hat_node(topology, hats, ["memory"]),
    }
    plan: list[dict[str, Any]] = []

    add_stage(plan, "executive_orientation", roles["executive"])
    add_stage(plan, "context", roles["context"])
    if roles["planner"] and edge_path_exists(
        topology, roles["executive"], roles["planner"], {"delegation", "context"}
    ):
        add_stage(plan, "planning", roles["planner"])
    elif roles["planner"]:
        add_stage(plan, "planning", roles["planner"])

    if roles["worker"] and roles["planner"] and edge_path_exists(
        topology, roles["planner"], roles["worker"], {"delegation", "context"}
    ):
        add_stage(plan, "work", roles["worker"])
    elif roles["worker"]:
        add_stage(plan, "work", roles["worker"])

    if roles["critic"] and roles["worker"] and edge_path_exists(
        topology, roles["worker"], roles["critic"], {"review"}
    ):
        add_stage(plan, "critique", roles["critic"])
        if edge_path_exists(topology, roles["critic"], roles["worker"], {"escalation"}):
            add_stage(plan, "revision", roles["worker"])

    if roles["verifier"] and roles["worker"] and edge_path_exists(
        topology, roles["worker"], roles["verifier"], {"review"}
    ):
        add_stage(plan, "verification", roles["verifier"])

    if roles["executive"] and (
        not roles["verifier"]
        or edge_path_exists(topology, roles["verifier"], roles["executive"], {"approval"})
    ):
        add_stage(plan, "executive_approval", roles["executive"])

    if roles["memory"]:
        add_stage(plan, "memory", roles["memory"])

    if not plan:
        plan = [
            {"key": "hat_turn", "node": node}
            for node in topological_hat_order(topology, hats)
        ]
    return plan[:max_turns]


def add_stage(plan: list[dict[str, Any]], key: str, node: dict[str, Any] | None) -> None:
    if node:
        plan.append({"key": key, "node": node})


def find_hat_node(
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
    terms: list[str],
) -> dict[str, Any] | None:
    for node in topology.get("nodes", []):
        if node.get("type") != "hat":
            continue
        hat = hats.get(node.get("hat_id"))
        if not hat:
            continue
        haystack = f"{node.get('id', '')} {node.get('name', '')} {node.get('role', '')} {hat.get('id', '')} {hat.get('name', '')}".lower()
        if any(term in haystack for term in terms):
            return node
    return None


def edge_path_exists(
    topology: dict[str, Any],
    source: dict[str, Any] | None,
    target: dict[str, Any] | None,
    edge_types: set[str],
) -> bool:
    if not source or not target:
        return False
    source_id = source.get("id")
    target_id = target.get("id")
    if not source_id or not target_id:
        return False
    edges = [
        edge
        for edge in topology.get("edges", [])
        if edge.get("type") in edge_types
    ]
    by_source: dict[str, list[dict[str, Any]]] = {}
    for edge in edges:
        by_source.setdefault(edge.get("source") or "", []).append(edge)
    seen = {source_id}
    queue: deque[tuple[str, int]] = deque([(source_id, 0)])
    while queue:
        node_id, depth = queue.popleft()
        if depth > 6:
            continue
        for edge in by_source.get(node_id, []):
            next_id = edge.get("target")
            if next_id == target_id:
                return True
            if next_id and next_id not in seen:
                seen.add(next_id)
                queue.append((next_id, depth + 1))
    return False


def topological_hat_order(
    topology: dict[str, Any],
    hats: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    nodes = [
        node
        for node in topology.get("nodes", [])
        if node.get("type") == "hat" and node.get("hat_id") in hats
    ]
    node_ids = {node["id"] for node in nodes}
    indegree = {node["id"]: 0 for node in nodes}
    outgoing: dict[str, list[str]] = {node["id"]: [] for node in nodes}
    for edge in topology.get("edges", []):
        source = edge.get("source")
        target = edge.get("target")
        if source in node_ids and target in node_ids:
            outgoing[source].append(target)
            indegree[target] += 1
    queue = deque([node_id for node_id, count in indegree.items() if count == 0])
    ordered_ids: list[str] = []
    while queue:
        node_id = queue.popleft()
        ordered_ids.append(node_id)
        for target in outgoing[node_id]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    for node in nodes:
        if node["id"] not in ordered_ids:
            ordered_ids.append(node["id"])
    node_by_id = {node["id"]: node for node in nodes}
    return [node_by_id[node_id] for node_id in ordered_ids]


def build_prompt(
    *,
    hat: dict[str, Any],
    node: dict[str, Any],
    blackboard: dict[str, Any],
    stage_outputs: dict[str, str],
    upstream_outputs: dict[str, str],
    topology: dict[str, Any],
    stage: dict[str, Any],
    step_index: int,
    edge_context: dict[str, Any],
) -> str:
    compact_stage_outputs = {
        key: value[:650]
        for key, value in list(stage_outputs.items())[-5:]
        if value
    }
    compact_upstream = {
        key: value[:650]
        for key, value in upstream_outputs.items()
        if value
    }
    node_controls = {
        "node_id": node.get("id"),
        "node_type": node.get("type"),
        "authority": node.get("authority") or [],
        "visibility": node.get("visibility") or "full_blackboard",
        "output_contract": node.get("output_contract") or "",
        "tools": node.get("tools") or hat.get("tools") or [],
    }
    return (
        f"Cluster task:\n{blackboard['goal']}\n\n"
        f"Topology: {topology.get('name') or topology.get('id')}\n"
        f"Current stage: {step_index} / {stage['key']}\n\n"
        f"Stage instruction:\n{STAGE_INSTRUCTIONS.get(stage['key'], STAGE_INSTRUCTIONS['hat_turn'])}\n\n"
        f"Node controls JSON:\n{json.dumps(node_controls, indent=2)}\n\n"
        f"Incoming/outgoing typed edges JSON:\n{json.dumps(edge_context, indent=2)}\n\n"
        f"Current blackboard JSON:\n{json.dumps(compact_blackboard(blackboard), indent=2)}\n\n"
        f"Upstream node outputs:\n{json.dumps(compact_upstream, indent=2)}\n\n"
        f"Recent stage outputs:\n{json.dumps(compact_stage_outputs, indent=2)}\n\n"
        f"Respond as {display_name(node, hat)}. Optimize for robust benchmark performance: "
        "clear reasoning, direct answers, evidence awareness, and resistance to shallow plausible mistakes. "
        "Keep the response under 350 words unless the final answer genuinely needs a compact table."
    )


def incoming_node_outputs(
    node: dict[str, Any],
    topology: dict[str, Any],
    node_outputs: dict[str, str],
) -> dict[str, str]:
    incoming: dict[str, str] = {}
    node_id = node.get("id")
    node_names = {item.get("id"): item.get("name") or item.get("id") for item in topology.get("nodes", [])}
    for edge in topology.get("edges", []):
        if edge.get("target") != node_id:
            continue
        source_id = edge.get("source")
        if source_id in node_outputs:
            label = f"{node_names.get(source_id, source_id)} via {edge.get('type') or 'edge'}"
            incoming[label] = node_outputs[source_id]
    return incoming


def describe_node_edges(node: dict[str, Any], topology: dict[str, Any]) -> dict[str, Any]:
    node_id = node.get("id")
    node_names = {item.get("id"): item.get("name") or item.get("id") for item in topology.get("nodes", [])}

    def describe(edge: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": edge.get("id"),
            "type": edge.get("type") or "context",
            "type_label": EDGE_TYPES.get(edge.get("type") or "context", "Context flow"),
            "source": node_names.get(edge.get("source"), edge.get("source")),
            "target": node_names.get(edge.get("target"), edge.get("target")),
            "blocking": bool(edge.get("blocking")),
            "payload": edge.get("payload") or "",
        }

    return {
        "incoming": [
            describe(edge)
            for edge in topology.get("edges", [])
            if edge.get("target") == node_id
        ],
        "outgoing": [
            describe(edge)
            for edge in topology.get("edges", [])
            if edge.get("source") == node_id
        ],
    }


def invoke_hat(
    hat: dict[str, Any],
    node: dict[str, Any],
    prompt: str,
) -> LlmResult:
    system_prompt = node.get("system_prompt") or hat.get("system_prompt") or ""
    return call_llm(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        model=node.get("model") or hat.get("model") or "auto",
        temperature=float(node.get("temperature") or hat.get("temperature") or 0.2),
        max_tokens=int(node.get("max_tokens") or hat.get("max_tokens") or 900),
    )


def node_allows_blackboard_write(node: dict[str, Any], hat: dict[str, Any]) -> bool:
    if "write_state" in (node.get("authority") or []):
        return True
    return bool(hat.get("can_write_blackboard", True))


def compact_blackboard(blackboard: dict[str, Any]) -> dict[str, Any]:
    compact: dict[str, Any] = {}
    for key, value in blackboard.items():
        if isinstance(value, list):
            compact[key] = [compact_text(item, 900) for item in value[-2:]]
        elif isinstance(value, str):
            compact[key] = compact_text(value, 1400)
        else:
            compact[key] = value
    return compact


def compact_text(value: Any, limit: int) -> str:
    text = str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}... [truncated {len(text) - limit} chars]"


def apply_blackboard_update(
    blackboard: dict[str, Any],
    node: dict[str, Any],
    hat: dict[str, Any],
    output: str,
    stage_key: str,
) -> None:
    if not output:
        return
    if stage_key == "executive_orientation":
        blackboard.setdefault("decisions", []).append(output)
        blackboard.setdefault("success_criteria", []).append(
            "Executive established success criteria for this run."
        )
    elif stage_key == "context":
        blackboard.setdefault("situation", []).append(output)
        blackboard.setdefault("assumptions", []).append(
            "Context Keeper updated the situation model."
        )
    elif stage_key == "planning":
        blackboard.setdefault("plan", []).append(output)
        blackboard.setdefault("task_packets", []).append(output)
    elif stage_key == "work":
        blackboard.setdefault("work_products", []).append(output)
        blackboard.setdefault("evidence", []).append(output)
    elif stage_key == "critique":
        blackboard.setdefault("objections", []).append(output)
        blackboard.setdefault("gate_status", []).append("Critic gate requested revision.")
    elif stage_key == "revision":
        blackboard.setdefault("revisions", []).append(output)
        blackboard.setdefault("work_products", []).append(output)
        blackboard.setdefault("evidence", []).append(output)
    elif stage_key == "verification":
        blackboard.setdefault("checks", []).append(output)
        blackboard.setdefault("gate_status", []).append("Verifier gate produced a verdict.")
    elif stage_key == "executive_approval":
        blackboard.setdefault("decisions", []).append(output)
        blackboard["final_answer"] = output
    elif stage_key == "memory":
        blackboard.setdefault("memory_candidates", []).append(output)
    else:
        name = f"{node.get('name') or hat.get('name') or ''}".lower()
        if "critic" in name:
            blackboard.setdefault("objections", []).append(output)
        elif "verifier" in name:
            blackboard.setdefault("checks", []).append(output)
        elif "planner" in name:
            blackboard.setdefault("plan", []).append(output)
        elif "worker" in name:
            blackboard.setdefault("work_products", []).append(output)
        else:
            blackboard.setdefault("notes", []).append(output)


def event_type_for_stage(stage_key: str, hat: dict[str, Any]) -> str:
    if stage_key == "critique":
        return "critic_objection"
    if stage_key == "verification":
        return "verifier_check"
    if stage_key.startswith("executive"):
        return "executive_turn"
    if stage_key == "revision":
        return "worker_revision"
    if stage_key == "memory":
        return "memory_turn"
    return "hat_turn"


def compose_final_result(
    task: str,
    blackboard: dict[str, Any],
    stage_outputs: dict[str, str],
) -> str:
    approved = stage_outputs.get("executive_approval")
    if approved:
        return approved
    revised = stage_outputs.get("revision")
    if revised:
        return revised
    work = stage_outputs.get("work")
    if work:
        return work
    return (
        f"Cluster did not produce an executable final answer for task: {task}\n\n"
        "Check the run trace for missing hat nodes, broken graph paths, or live LLM errors."
    )


def validate_topology(topology: dict[str, Any], hats: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    nodes = topology.get("nodes", [])
    edges = topology.get("edges", [])
    node_by_id = {node.get("id"): node for node in nodes}

    def warn(code: str, message: str) -> None:
        warnings.append({"code": code, "message": message})

    roles = {
        "executive": find_hat_node(topology, hats, ["executive"]),
        "worker": find_hat_node(topology, hats, ["worker"]),
        "critic": find_hat_node(topology, hats, ["critic"]),
        "verifier": find_hat_node(topology, hats, ["verifier"]),
        "memory": find_hat_node(topology, hats, ["memory"]),
    }
    if not roles["executive"]:
        warn("missing_executive", "No Executive hat node controls final approval.")
    if not roles["worker"]:
        warn("missing_worker", "No Worker hat node can execute task packets.")
    if not roles["critic"]:
        warn("missing_critic", "No Critic hat node challenges shallow or flawed work.")
    if not roles["verifier"]:
        warn("missing_verifier", "No Verifier hat node checks evidence before approval.")

    for edge in edges:
        if edge.get("source") not in node_by_id or edge.get("target") not in node_by_id:
            warn("broken_edge", f"Edge {edge.get('id') or '(unnamed)'} points to a missing node.")
        if edge.get("type") not in EDGE_TYPES:
            warn("unknown_edge_type", f"Edge {edge.get('id') or '(unnamed)'} has an unknown type.")

    final_nodes = [node for node in nodes if node.get("type") == "output"]
    if not final_nodes:
        warn("missing_final_output", "No Final Output node exists.")
    elif roles["executive"]:
        has_approval = any(
            edge.get("source") == roles["executive"]["id"]
            and edge.get("target") == final_node.get("id")
            and edge.get("type") == "approval"
            for final_node in final_nodes
            for edge in edges
        )
        if not has_approval:
            warn("missing_final_approval", "Final Output has no approval edge from Executive.")

    if roles["worker"] and roles["critic"] and not edge_path_exists(
        topology, roles["worker"], roles["critic"], {"review"}
    ):
        warn("missing_critic_path", "Worker output does not pass through a Critic review path.")
    if roles["worker"] and roles["verifier"] and not edge_path_exists(
        topology, roles["worker"], roles["verifier"], {"review"}
    ):
        warn("missing_verifier_path", "Worker output does not pass through a Verifier review path.")
    if roles["verifier"] and roles["executive"] and not edge_path_exists(
        topology, roles["verifier"], roles["executive"], {"approval"}
    ):
        warn("missing_verifier_approval", "Verifier has no approval path back to Executive.")

    memory_store_nodes = [
        node for node in nodes if node.get("type") == "store" and "memory" in str(node.get("id", "")).lower()
    ]
    for store_node in memory_store_nodes:
        incoming_writers = [
            edge.get("source")
            for edge in edges
            if edge.get("target") == store_node.get("id") and edge.get("type") == "state"
        ]
        for source_id in incoming_writers:
            source_node = node_by_id.get(source_id)
            if source_node and source_node is not roles["memory"]:
                warn("uncurated_memory_write", "Memory Store receives state writes from a non-curator node.")
    return warnings


def display_name(node: dict[str, Any], hat: dict[str, Any]) -> str:
    return str(node.get("name") or hat.get("name") or node.get("id") or hat.get("id") or "Hat")


def blackboard_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    delta: dict[str, Any] = {}
    for key, value in after.items():
        if before.get(key) != value:
            if isinstance(value, list) and isinstance(before.get(key), list):
                delta[key] = value[len(before.get(key, [])) :]
            else:
                delta[key] = value
    return delta
