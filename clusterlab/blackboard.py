from __future__ import annotations

from typing import Any


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


def blackboard_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    delta: dict[str, Any] = {}
    for key, value in after.items():
        if before.get(key) != value:
            if isinstance(value, list) and isinstance(before.get(key), list):
                delta[key] = value[len(before.get(key, [])) :]
            else:
                delta[key] = value
    return delta
