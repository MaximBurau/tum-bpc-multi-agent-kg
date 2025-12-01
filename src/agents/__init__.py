# src/agents/__init__.py
"""
Agent system for dynamic KG extraction.

Provides:
- KGAgent: Base agent class using LangChain structured output
- Schema builder: Dynamic Pydantic model generation
- Agent loader: Load agents from DB by name@version
- Agent registry: CRUD operations for agent types/versions
- Agent types: EntityExtractorAgent, RelationExtractorAgent
"""

from .kg_agent import KGAgent
from .schema_builder import build_pydantic_model, parse_type
from .loader import load_agent, get_available_agents
from .registry import (
    create_agent_type,
    create_agent_version,
    get_agent_type,
    get_agent_types,
    get_agent_version,
    get_agent_versions,
    get_agent_registry,
)

__all__ = [
    # Core agent
    "KGAgent",
    # Schema building
    "build_pydantic_model",
    "parse_type",
    # Loading
    "load_agent",
    "get_available_agents",
    # Registry CRUD
    "create_agent_type",
    "create_agent_version",
    "get_agent_type",
    "get_agent_types",
    "get_agent_version",
    "get_agent_versions",
    "get_agent_registry",
]

