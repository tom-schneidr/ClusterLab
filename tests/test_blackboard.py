from __future__ import annotations

from clusterlab.blackboard import (
    apply_blackboard_update,
    blackboard_delta,
    compact_blackboard,
    initial_blackboard,
)


def test_initial_blackboard_contains_goal_and_empty_sections() -> None:
    blackboard = initial_blackboard("Ship a refactor")

    assert blackboard["goal"] == "Ship a refactor"
    assert blackboard["plan"] == []
    assert blackboard["final_answer"] == ""


def test_apply_blackboard_update_routes_stage_outputs() -> None:
    blackboard = initial_blackboard("Verify behavior")

    apply_blackboard_update(
        blackboard,
        {"name": "Worker"},
        {"name": "Worker"},
        "implemented change",
        "work",
    )
    apply_blackboard_update(
        blackboard,
        {"name": "Executive"},
        {"name": "Executive"},
        "approved answer",
        "executive_approval",
    )

    assert blackboard["work_products"] == ["implemented change"]
    assert blackboard["evidence"] == ["implemented change"]
    assert blackboard["final_answer"] == "approved answer"


def test_compact_blackboard_truncates_long_values() -> None:
    blackboard = initial_blackboard("x" * 2000)

    compact = compact_blackboard(blackboard)

    assert "[truncated" in compact["goal"]


def test_blackboard_delta_reports_added_list_items() -> None:
    before = {"checks": ["old"], "final_answer": ""}
    after = {"checks": ["old", "new"], "final_answer": "done"}

    assert blackboard_delta(before, after) == {
        "checks": ["new"],
        "final_answer": "done",
    }
