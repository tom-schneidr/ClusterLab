from __future__ import annotations

from collections import deque
from typing import Any

EDGE_TYPES: dict[str, str] = {
    "context": "Context flow",
    "delegation": "Task delegation",
    "review": "Review gate",
    "state": "State read/write",
    "escalation": "Escalation or revision",
    "approval": "Approval path",
}
NODE_TYPES = {"hat", "store", "gate", "tool", "output"}
BLOCKING_VALIDATION_CODES = {
    "duplicate_node_id",
    "duplicate_edge_id",
    "missing_node_id",
    "missing_edge_id",
    "unknown_node_type",
    "unknown_edge_type",
    "broken_edge",
}


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
        haystack = " ".join(
            [
                str(node.get("id", "")),
                str(node.get("name", "")),
                str(node.get("role", "")),
                str(hat.get("id", "")),
                str(hat.get("name", "")),
            ]
        ).lower()
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
    edges = [edge for edge in topology.get("edges", []) if edge.get("type") in edge_types]
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
    node_ids = [node.get("id") for node in nodes]
    edge_ids = [edge.get("id") for edge in edges]
    for node in nodes:
        if not node.get("id"):
            warn("missing_node_id", "A topology node is missing an id.")
        if node.get("type") not in NODE_TYPES:
            warn("unknown_node_type", f"Node {node.get('id') or '(unnamed)'} has an unknown type.")
    for node_id in sorted({item for item in node_ids if item and node_ids.count(item) > 1}):
        warn("duplicate_node_id", f"Node id {node_id} is used more than once.")
    for edge in edges:
        if not edge.get("id"):
            warn("missing_edge_id", "A topology edge is missing an id.")
    for edge_id in sorted({item for item in edge_ids if item and edge_ids.count(item) > 1}):
        warn("duplicate_edge_id", f"Edge id {edge_id} is used more than once.")

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

    if (
        roles["worker"]
        and roles["critic"]
        and not edge_path_exists(topology, roles["worker"], roles["critic"], {"review"})
    ):
        warn("missing_critic_path", "Worker output does not pass through a Critic review path.")
    if (
        roles["worker"]
        and roles["verifier"]
        and not edge_path_exists(topology, roles["worker"], roles["verifier"], {"review"})
    ):
        warn("missing_verifier_path", "Worker output does not pass through a Verifier review path.")
    if (
        roles["verifier"]
        and roles["executive"]
        and not edge_path_exists(topology, roles["verifier"], roles["executive"], {"approval"})
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


def blocking_topology_errors(topology: dict[str, Any], hats: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    warnings = validate_topology(topology, hats)
    return [item for item in warnings if item["code"] in BLOCKING_VALIDATION_CODES]
