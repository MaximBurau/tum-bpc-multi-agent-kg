""" Flow registry - CRUD operations for flows and flow runs."""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from src.models import Flow, FlowRun
from src.db import get_session


def create_flow(
    name: str,
    yaml_definition: str,
    session: Optional[Session] = None
) -> Flow:
    """
    Create a new flow.
    
    Args:
        name: Display name for the flow
        yaml_definition: YAML string defining the flow steps
        session: Optional database session
        
    Returns:
        Created Flow instance
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        # add flow to database 
        flow = Flow(name=name, yaml_definition=yaml_definition)
        session.add(flow)
        session.commit()
        session.refresh(flow)
        return flow
    finally:
        if own_session:
            session.close()


def get_flow(flow_id: int, session: Optional[Session] = None) -> Optional[Flow]:
    """Get a flow by ID."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        return session.query(Flow).filter_by(id=flow_id).first()
    finally:
        if own_session:
            session.close()


def get_flow_by_name(name: str, session: Optional[Session] = None) -> Optional[Flow]:
    """Get a flow by name."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        return session.query(Flow).filter_by(name=name).first()
    finally:
        if own_session:
            session.close()


def get_flows(session: Optional[Session] = None) -> List[Flow]:
    """Get all flows."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        return session.query(Flow).order_by(Flow.created_at.desc()).all()
    finally:
        if own_session:
            session.close()


def update_flow(
    flow_id: int,
    name: Optional[str] = None,
    yaml_definition: Optional[str] = None,
    session: Optional[Session] = None
) -> Optional[Flow]:
    """
    Update a flow's name and/or YAML definition.
    
    Returns updated Flow or None if not found.
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        flow = session.query(Flow).filter_by(id=flow_id).first()
        if not flow:
            return None
        
        if name is not None:
            flow.name = name
        if yaml_definition is not None:
            flow.yaml_definition = yaml_definition
        
        session.commit()
        session.refresh(flow)
        return flow
    finally:
        if own_session:
            session.close()


def delete_flow(flow_id: int, session: Optional[Session] = None) -> bool:
    """Delete a flow and all its runs. Returns True if deleted."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        flow = session.query(Flow).filter_by(id=flow_id).first()
        if not flow:
            return False
        
        session.delete(flow)
        session.commit()
        return True
    finally:
        if own_session:
            session.close()


def get_flows_list(session: Optional[Session] = None) -> List[Dict[str, Any]]:
    """
    Get all flows as serializable dicts.
    
    Returns:
        List of flow dicts with basic info and run counts.
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        flows = session.query(Flow).order_by(Flow.created_at.desc()).all()
        
        result = []
        for flow in flows:
            run_count = session.query(FlowRun).filter_by(flow_id=flow.id).count()
            
            result.append({
                "id": flow.id,
                "name": flow.name,
                "created_at": flow.created_at.isoformat() if flow.created_at else None,
                "run_count": run_count
            })
        
        return result
    finally:
        if own_session:
            session.close()


def get_flow_detail(flow_id: int, session: Optional[Session] = None) -> Optional[Dict[str, Any]]:
    """
    Get detailed flow information including YAML.
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        flow = session.query(Flow).filter_by(id=flow_id).first()
        if not flow:
            return None
        
        run_count = session.query(FlowRun).filter_by(flow_id=flow.id).count()
        
        return {
            "id": flow.id,
            "name": flow.name,
            "yaml_definition": flow.yaml_definition,
            "created_at": flow.created_at.isoformat() if flow.created_at else None,
            "run_count": run_count
        }
    finally:
        if own_session:
            session.close()


def get_flow_runs(
    flow_id: int,
    limit: int = 50,
    offset: int = 0,
    session: Optional[Session] = None
) -> List[Dict[str, Any]]:
    """
    Get runs for a flow, newest first.
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        runs = session.query(FlowRun).filter_by(
            flow_id=flow_id
        ).order_by(FlowRun.created_at.desc()).offset(offset).limit(limit).all()
        
        return [
            {
                "id": r.id,
                "flow_id": r.flow_id,
                "input_text": r.input_text[:100] + "..." if r.input_text and len(r.input_text) > 100 else r.input_text,
                "status": r.status,
                "duration_seconds": r.duration_seconds,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in runs
        ]
    finally:
        if own_session:
            session.close()


def get_flow_run_detail(run_id: int, session: Optional[Session] = None) -> Optional[Dict[str, Any]]:
    """
    Get detailed information about a specific run.
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        run = session.query(FlowRun).filter_by(id=run_id).first()
        if not run:
            return None
        
        return {
            "id": run.id,
            "flow_id": run.flow_id,
            "input_text": run.input_text,
            "output_json": run.output_json,
            "trace_json": run.trace_json,
            "status": run.status,
            "error_message": run.error_message,
            "duration_seconds": run.duration_seconds,
            "created_at": run.created_at.isoformat() if run.created_at else None
        }
    finally:
        if own_session:
            session.close()


def delete_flow_run(run_id: int, session: Optional[Session] = None) -> bool:
    """Delete a flow run. Returns True if deleted."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        run = session.query(FlowRun).filter_by(id=run_id).first()
        if not run:
            return False
        
        session.delete(run)
        session.commit()
        return True
    finally:
        if own_session:
            session.close()

