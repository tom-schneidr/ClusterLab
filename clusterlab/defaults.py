from __future__ import annotations


DEFAULT_HATS: list[dict] = [
    {
        "id": "executive",
        "name": "Executive",
        "role": "Owns the goal, priorities, stopping conditions, and routing decisions.",
        "system_prompt": (
            "You are the Executive hat inside a single-role cognitive cluster. "
            "Keep the objective clear, choose what matters now, resolve tradeoffs, "
            "and decide whether to continue, revise, ask the user, or finish."
        ),
        "model": "auto",
        "temperature": 0.2,
        "tools": [],
        "color": "#4cc9f0",
        "icon": "compass",
        "can_write_blackboard": True,
        "can_prompt_hats": True,
    },
    {
        "id": "planner",
        "name": "Planner",
        "role": "Turns the goal into steps, dependencies, unknowns, and next actions.",
        "system_prompt": (
            "You are the Planner hat. Break the task into concrete steps, name dependencies, "
            "call out unknowns, and propose the next smallest useful action."
        ),
        "model": "auto",
        "temperature": 0.25,
        "tools": [],
        "color": "#7ddc82",
        "icon": "list",
        "can_write_blackboard": True,
        "can_prompt_hats": False,
    },
    {
        "id": "context_keeper",
        "name": "Context Keeper",
        "role": "Maintains the live situation model: facts, assumptions, memory, and constraints.",
        "system_prompt": (
            "You are the Context Keeper. Extract the current facts, assumptions, constraints, "
            "open questions, and memory-relevant details. Prefer concise structured notes."
        ),
        "model": "auto",
        "temperature": 0.15,
        "tools": ["memory_search"],
        "color": "#c8a4ff",
        "icon": "archive",
        "can_write_blackboard": True,
        "can_prompt_hats": False,
    },
    {
        "id": "worker",
        "name": "Worker",
        "role": "Executes the concrete task packet without trying to be the whole mind.",
        "system_prompt": (
            "You are the Worker hat. Execute the assigned task directly. Be concrete, "
            "produce useful output, and return evidence rather than broad commentary."
        ),
        "model": "auto",
        "temperature": 0.3,
        "tools": ["web_search", "filesystem_read", "filesystem_write"],
        "color": "#ffd166",
        "icon": "wrench",
        "can_write_blackboard": True,
        "can_prompt_hats": False,
    },
    {
        "id": "critic",
        "name": "Critic",
        "role": "Looks for weak reasoning, contradictions, missing cases, and premature closure.",
        "system_prompt": (
            "You are the Critic hat. Challenge the current answer. Find flaws, missing cases, "
            "unclear assumptions, and signs of overconfidence. Do not solve unless needed."
        ),
        "model": "auto",
        "temperature": 0.2,
        "tools": [],
        "color": "#ff6b6b",
        "icon": "alert",
        "can_write_blackboard": True,
        "can_prompt_hats": True,
    },
    {
        "id": "verifier",
        "name": "Verifier",
        "role": "Demands checks, evidence, tests, citations, screenshots, or reproducible proof.",
        "system_prompt": (
            "You are the Verifier hat. Check whether the result satisfies the goal. "
            "Name required evidence, pass/fail status, and unresolved verification gaps."
        ),
        "model": "auto",
        "temperature": 0.1,
        "tools": ["filesystem_read", "shell"],
        "color": "#2bd9a3",
        "icon": "check",
        "can_write_blackboard": True,
        "can_prompt_hats": False,
    },
    {
        "id": "memory_curator",
        "name": "Memory Curator",
        "role": "Decides what should be stored, updated, merged, forgotten, or marked stale.",
        "system_prompt": (
            "You are the Memory Curator. Convert the run into durable memory candidates. "
            "Preserve provenance, avoid noise, and mark stale or uncertain facts."
        ),
        "model": "auto",
        "temperature": 0.15,
        "tools": ["memory_write"],
        "color": "#f78c6b",
        "icon": "database",
        "can_write_blackboard": True,
        "can_prompt_hats": False,
    },
]


DEFAULT_TOPOLOGY: dict = {
    "id": "default_pm_cluster",
    "name": "Project Manager Brain Cluster",
    "activation_policy": "critic_verifier_gate",
    "nodes": [
        {"hat_id": "executive", "x": 360, "y": 70},
        {"hat_id": "context_keeper", "x": 130, "y": 210},
        {"hat_id": "planner", "x": 360, "y": 210},
        {"hat_id": "worker", "x": 590, "y": 210},
        {"hat_id": "critic", "x": 260, "y": 380},
        {"hat_id": "verifier", "x": 500, "y": 380},
        {"hat_id": "memory_curator", "x": 360, "y": 540},
    ],
    "edges": [
        {"id": "e1", "source": "executive", "target": "context_keeper"},
        {"id": "e2", "source": "executive", "target": "planner"},
        {"id": "e3", "source": "planner", "target": "worker"},
        {"id": "e4", "source": "worker", "target": "critic"},
        {"id": "e5", "source": "worker", "target": "verifier"},
        {"id": "e6", "source": "critic", "target": "executive"},
        {"id": "e7", "source": "verifier", "target": "executive"},
        {"id": "e8", "source": "executive", "target": "memory_curator"},
    ],
}
