from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

NodeType = Literal["hat", "store", "gate", "tool", "output"]
EdgeType = Literal["context", "delegation", "review", "state", "escalation", "approval"]
RunStatus = Literal["queued", "running", "completed", "failed", "stopped"]


class ErrorDetail(BaseModel):
    code: str
    message: str


class ValidationWarning(BaseModel):
    code: str
    message: str


class HatDefinitionIn(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(default="", max_length=500)
    system_prompt: str = Field(default="", max_length=8000)
    model: str = Field(default="auto", max_length=120)
    temperature: float = Field(default=0.2, ge=0, le=2)
    tools: list[str] = Field(default_factory=list)
    color: str = "#42c6ff"
    icon: str = "brain"
    can_write_blackboard: bool = True
    can_prompt_hats: bool = False

    @field_validator("id")
    @classmethod
    def clean_optional_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class TopologyNode(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    type: NodeType
    name: str = Field(default="", max_length=120)
    role: str = Field(default="", max_length=1000)
    hat_id: str | None = None
    authority: list[str] = Field(default_factory=list)
    visibility: str = Field(default="full_blackboard", max_length=120)
    output_contract: str = Field(default="", max_length=1000)
    tools: list[str] = Field(default_factory=list)
    store_key: str = Field(default="", max_length=120)
    color: str = Field(default="#42c6ff", max_length=20)
    x: float = 0
    y: float = 0
    template_id: str | None = None
    system_prompt: str = Field(default="", max_length=8000)


class TopologyEdge(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    source: str = Field(min_length=1, max_length=120)
    target: str = Field(min_length=1, max_length=120)
    type: EdgeType = "context"
    blocking: bool = False
    payload: str = Field(default="", max_length=1000)


class TopologyIn(BaseModel):
    schema_version: int = 2
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    nodes: list[TopologyNode] = Field(default_factory=list)
    edges: list[TopologyEdge] = Field(default_factory=list)

    @field_validator("schema_version")
    @classmethod
    def supported_schema_version(cls, value: int) -> int:
        if value != 2:
            raise ValueError("Only topology schema_version 2 is supported.")
        return value

    @field_validator("id")
    @classmethod
    def clean_optional_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class RunStartIn(BaseModel):
    topology_id: str
    task: str = Field(min_length=1, max_length=12000)
    max_turns: int = Field(default=12, ge=1, le=32)


class RunSummary(BaseModel):
    id: str
    topology_id: str
    status: RunStatus
    task: str
    blackboard: dict[str, Any]
    final_result: str
    created_at: str
    updated_at: str


class RunEventOut(BaseModel):
    id: int
    run_id: str
    seq: int
    event_type: str
    hat_id: str | None = None
    hat_name: str | None = None
    prompt: str = ""
    output: str = ""
    blackboard_before: dict[str, Any] = Field(default_factory=dict)
    blackboard_after: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class RunDetail(RunSummary):
    events: list[RunEventOut] = Field(default_factory=list)
