# src/models.py
"""
SQLAlchemy models for the dynamic multi-agent KG system.

Defines tables for agent types, versions, flows, and flow execution runs.
"""

from sqlalchemy import Column, Integer, String, JSON, Float, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone

# table mapping base class
Base = declarative_base()


class AgentType(Base):
    """
    Represents a type of agent (e.g., entity_extractor, relation_extractor).
    Points to the Python class that implements it.
    """
    __tablename__ = "agent_types"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)  # "entity_extractor"
    python_class = Column(String)       # "src.agents.types.entity_extractor.EntityExtractorAgent"

    versions = relationship("AgentVersion", back_populates="agent_type", cascade="all, delete-orphan")


class AgentVersion(Base):
    """
    A specific version of an agent with its prompt, schema, and model configuration.
    Multiple versions can exist per agent type.
    """
    __tablename__ = "agent_versions"

    id = Column(Integer, primary_key=True)
    agent_type_id = Column(Integer, ForeignKey("agent_types.id"))
    version_number = Column(Integer)
    prompt = Column(String)
    schema_json = Column(JSON)  # Dynamic Pydantic schema definition
    model_name = Column(String)
    tools_json = Column(JSON)  # Reserved for future tool definitions
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    agent_type = relationship("AgentType", back_populates="versions")


class Flow(Base):
    """
    A pipeline definition stored as YAML. Defines the sequence of agents
    and how data flows between them.
    """
    __tablename__ = "flows"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    yaml_definition = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    runs = relationship("FlowRun", back_populates="flow", cascade="all, delete-orphan")


class FlowRun(Base):
    """
    Records a single execution of a flow, including inputs, outputs, and traces.
    Enables debugging, comparison, and evaluation.
    """
    __tablename__ = "flow_runs"

    id = Column(Integer, primary_key=True)
    flow_id = Column(Integer, ForeignKey("flows.id"))
    input_text = Column(String)
    output_json = Column(JSON)  # Final output from the flow
    trace_json = Column(JSON)   # Per-step trace: inputs, prompts, outputs, timing
    status = Column(String)     # "running", "completed", "failed"
    error_message = Column(String)  # Error details if failed
    duration_seconds = Column(Float)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    flow = relationship("Flow", back_populates="runs")