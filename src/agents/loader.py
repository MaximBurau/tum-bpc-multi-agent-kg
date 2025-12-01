""" Agent loader - loads agents from database by name and version. """

import importlib
from typing import Dict, Type, Optional

from sqlalchemy.orm import Session

from src.models import AgentType, AgentVersion
from src.agents.kg_agent import KGAgent


def load_agent(
    session: Session,
    agent_ref: str,
    model_cache: Dict[str, Type]
) -> KGAgent:
    """
    Load an agent by name and optional version.
    
    Args:
        session: SQLAlchemy database session
        agent_ref: Agent reference in format "name@version" or just "name"
                   Examples: "entity_extractor@1", "relation_extractor"
        model_cache: Shared cache for Pydantic models
        
    Returns:
        Instantiated agent (subclass of KGAgent)
        
    Raises:
        ValueError: If agent type or version not found
    """
    # Parse agent reference
    if "@" in agent_ref:
        name, version_str = agent_ref.split("@", 1)
        version = int(version_str)
    else:
        name = agent_ref
        version = None  # get latest
    
    # Look up agent type
    agent_type = session.query(AgentType).filter_by(name=name).first()
    if not agent_type:
        raise ValueError(f"Agent type not found: {name}")
    
    # Look up version (specific or latest)
    if version is not None:
        agent_version = session.query(AgentVersion).filter_by(
            agent_type_id=agent_type.id,
            version_number=version
        ).first()
        if not agent_version:
            raise ValueError(f"Agent version not found: {agent_ref}")
    else:
        # Get latest version
        agent_version = session.query(AgentVersion).filter_by(
            agent_type_id=agent_type.id
        ).order_by(AgentVersion.version_number.desc()).first()
        if not agent_version:
            raise ValueError(f"No versions found for agent: {name}")
    
    # Dynamically import the Python class
    module_path, class_name = agent_type.python_class.rsplit(".", 1)
    try:
        module = importlib.import_module(module_path)
        AgentClass = getattr(module, class_name)
    except (ImportError, AttributeError) as e:
        raise ValueError(f"Failed to load agent class {agent_type.python_class}: {e}")
    
    # Instantiate and return
    return AgentClass(agent_version, model_cache)


def get_available_agents(session: Session) -> list:
    """
    Get list of all available agent types with their versions.
    
    Returns:
        List of dicts with agent info:
        [
            {
                "name": "entity_extractor",
                "python_class": "src.agents.types...",
                "versions": [1, 2, 3],
                "latest_version": 3
            },
            ...
        ]
    """
    agent_types = session.query(AgentType).all()
    
    result = []
    for at in agent_types:
        versions = session.query(AgentVersion).filter_by(
            agent_type_id=at.id
        ).order_by(AgentVersion.version_number.desc()).all()
        
        version_numbers = [v.version_number for v in versions]
        
        result.append({
            "name": at.name,
            "python_class": at.python_class,
            "versions": sorted(version_numbers),
            "latest_version": version_numbers[0] if version_numbers else None
        })
    
    return result

