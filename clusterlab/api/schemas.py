from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


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


class TopologyIn(BaseModel):
    schema_version: int = 2
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class RunStartIn(BaseModel):
    topology_id: str
    task: str = Field(min_length=1, max_length=12000)
    max_turns: int = Field(default=12, ge=1, le=32)
