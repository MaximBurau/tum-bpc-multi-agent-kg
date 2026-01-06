"""Agent registry - CRUD operations for agent types and versions."""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from src.models import AgentType, AgentVersion
from src.db import get_session


def create_agent_type(
    name: str,
    python_class: str,
    session: Optional[Session] = None
) -> AgentType:
    """
    Create a new agent type.
    
    Args:
        name: Unique name for the agent type (e.g., "entity_extractor")
        python_class: Full import path to the Python class
        session: Optional database session
        
    Returns:
        Created AgentType instance
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        # add agent type to database 
        agent_type = AgentType(name=name, python_class=python_class)
        session.add(agent_type)
        session.commit()
        session.refresh(agent_type)
        return agent_type
    finally:
        if own_session:
            session.close()


def get_agent_type(name: str, session: Optional[Session] = None) -> Optional[AgentType]:
    """Get an agent type by name."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        return session.query(AgentType).filter_by(name=name).first()
    finally:
        if own_session:
            session.close()


def get_agent_types(session: Optional[Session] = None) -> List[AgentType]:
    """Get all agent types."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        return session.query(AgentType).all()
    finally:
        if own_session:
            session.close()


def create_agent_version(
    agent_type_name: str,
    prompt: str,
    schema_json: List[Dict],
    model_name: str,
    tools_json: Optional[List] = None,
    session: Optional[Session] = None
) -> AgentVersion:
    """
    Create a new version for an agent type.
    
    Automatically assigns the next version number.
    
    Args:
        agent_type_name: Name of the agent type
        prompt: Prompt template with {placeholders}
        schema_json: Dynamic schema definition
        model_name: LLM model identifier
        tools_json: Optional tool definitions
        session: Optional database session
        
    Returns:
        Created AgentVersion instance
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        # Find agent type
        agent_type = session.query(AgentType).filter_by(name=agent_type_name).first()
        if not agent_type:
            raise ValueError(f"Agent type not found: {agent_type_name}")
        
        # Get next version number
        latest = session.query(AgentVersion).filter_by(
            agent_type_id=agent_type.id
        ).order_by(AgentVersion.version_number.desc()).first()
        
        next_version = (latest.version_number + 1) if latest else 1
        
        # Create version
        version = AgentVersion(
            agent_type_id=agent_type.id,
            version_number=next_version,
            prompt=prompt,
            schema_json=schema_json,
            model_name=model_name,
            tools_json=tools_json
        )
        session.add(version)
        session.commit()
        session.refresh(version)
        return version
    finally:
        if own_session:
            session.close()


def get_agent_version(
    agent_type_name: str,
    version_number: Optional[int] = None,
    session: Optional[Session] = None
) -> Optional[AgentVersion]:
    """
    Get a specific version of an agent, or the latest if version_number is None.
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        agent_type = session.query(AgentType).filter_by(name=agent_type_name).first()
        if not agent_type:
            return None
        
        if version_number is not None:
            return session.query(AgentVersion).filter_by(
                agent_type_id=agent_type.id,
                version_number=version_number
            ).first()
        else:
            return session.query(AgentVersion).filter_by(
                agent_type_id=agent_type.id
            ).order_by(AgentVersion.version_number.desc()).first()
    finally:
        if own_session:
            session.close()


def update_agent_version(
    agent_type_name: str,
    version_number: int,
    prompt: Optional[str] = None,
    schema_json: Optional[List[Dict]] = None,
    model_name: Optional[str] = None,
    session: Optional[Session] = None
) -> AgentVersion:
    """
    Update an existing agent version.
    
    Only updates fields that are provided (not None).
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        agent_type = session.query(AgentType).filter_by(name=agent_type_name).first()
        if not agent_type:
            raise ValueError(f"Agent type not found: {agent_type_name}")
        
        version = session.query(AgentVersion).filter_by(
            agent_type_id=agent_type.id,
            version_number=version_number
        ).first()
        
        if not version:
            raise ValueError(f"Version not found: {agent_type_name}@{version_number}")
        
        # Update only provided fields
        if prompt is not None:
            version.prompt = prompt
        if schema_json is not None:
            version.schema_json = schema_json
        if model_name is not None:
            version.model_name = model_name
        
        session.commit()
        session.refresh(version)
        return version
    finally:
        if own_session:
            session.close()


def get_agent_versions(
    agent_type_name: str,
    session: Optional[Session] = None
) -> List[AgentVersion]:
    """Get all versions of an agent type, newest first."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        agent_type = session.query(AgentType).filter_by(name=agent_type_name).first()
        if not agent_type:
            return []
        
        return session.query(AgentVersion).filter_by(
            agent_type_id=agent_type.id
        ).order_by(AgentVersion.version_number.desc()).all()
    finally:
        if own_session:
            session.close()


def get_agent_registry(session: Optional[Session] = None) -> List[Dict[str, Any]]:
    """
    Get full agent registry with types and versions.
    
    Returns:
        List of dicts:
        [
            {
                "id": 1,
                "name": "entity_extractor",
                "python_class": "...",
                "versions": [
                    {"version": 1, "model": "gpt-4o", "created_at": "..."},
                    ...
                ]
            },
            ...
        ]
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        agent_types = session.query(AgentType).all()
        
        result = []
        for at in agent_types:
            versions = session.query(AgentVersion).filter_by(
                agent_type_id=at.id
            ).order_by(AgentVersion.version_number.desc()).all()
            
            result.append({
                "id": at.id,
                "name": at.name,
                "python_class": at.python_class,
                "versions": [
                    {
                        "id": v.id,
                        "version": v.version_number,
                        "model": v.model_name,
                        "created_at": v.created_at.isoformat() if v.created_at else None
                    }
                    for v in versions
                ]
            })
        
        return result
    finally:
        if own_session:
            session.close()


def update_agent_type_name(
    old_name: str,
    new_name: str,
    session: Optional[Session] = None
) -> Optional[AgentType]:
    """
    Update an agent type's name.
    
    Args:
        old_name: Current name of the agent type
        new_name: New name for the agent type
        session: Optional database session
        
    Returns:
        Updated AgentType instance or None if not found
        
    Raises:
        ValueError: If new_name already exists
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        # Check if agent type exists
        agent_type = session.query(AgentType).filter_by(name=old_name).first()
        if not agent_type:
            return None
        
        # Check if new name already exists
        existing = session.query(AgentType).filter_by(name=new_name).first()
        if existing and existing.id != agent_type.id:
            raise ValueError(f"Agent type with name '{new_name}' already exists")
        
        # Update name
        agent_type.name = new_name
        session.commit()
        session.refresh(agent_type)
        return agent_type
    finally:
        if own_session:
            session.close()


def delete_agent_type(name: str, session: Optional[Session] = None) -> bool:
    """Delete an agent type and all its versions. Returns True if deleted."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        agent_type = session.query(AgentType).filter_by(name=name).first()
        if not agent_type:
            return False
        
        session.delete(agent_type)
        session.commit()
        return True
    finally:
        if own_session:
            session.close()

