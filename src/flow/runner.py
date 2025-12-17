"""
Flow runner - executes compiled flows and stores run records.

Handles:
- Flow compilation and execution
- Trace collection
- Run record storage
- Neo4j integration (not needed for now)
"""

import time
import asyncio
from typing import Dict, Any, Optional

from sqlalchemy.orm import Session

from src.flow.compiler import compile_flow
from src.models import Flow, FlowRun
from src.db import get_session


def _serialize_output(result: Dict) -> Dict:
    """Convert Pydantic models in result to dicts for JSON storage."""
    serialized = {}
    
    for key, value in result.items():
        # Skip trace keys - handled separately
        if key.startswith("_trace_"):
            continue
        
        if value is None:
            serialized[key] = None
        elif hasattr(value, "model_dump"):
            serialized[key] = value.model_dump()
        elif isinstance(value, list):
            serialized[key] = [
                v.model_dump() if hasattr(v, "model_dump") else v
                for v in value
            ]
        else:
            serialized[key] = value
    
    return serialized


def _serialize_value(value: Any) -> Any:
    """Recursively serialize a value for JSON storage."""
    if value is None:
        return None
    elif hasattr(value, "model_dump"):
        return value.model_dump()
    elif isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_serialize_value(v) for v in value]
    else:
        return value


def _collect_traces(result: Dict) -> Dict:
    """Extract all trace information from result and serialize it."""
    traces = {}
    
    for key, value in result.items():
        if key.startswith("_trace_"):
            step_id = key.removeprefix("_trace_")  
            # Recursively serialize all values in trace
            traces[step_id] = _serialize_value(value)
    
    return traces


async def run_flow(
    flow_id: int,
    input_text: str,
    write_to_neo4j: bool = True,
    session: Optional[Session] = None,
    initial_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Execute a flow and store the run record.
    
    Args:
        flow_id: ID of the flow to execute
        input_text: Input text to process
        write_to_neo4j: Whether to write extracted KG to Neo4j
        session: Optional database session (creates one if not provided)
        initial_state: Optional additional state to pass to flow (merged with {"text": input_text})
        
    Returns:
        Dict with run results:
        {
            "run_id": 1,
            "output": {"entities": [...], "relations": [...]},
            "trace": {...},
            "duration_seconds": 3.45
        }
    """
    own_session = session is None
    if own_session:
        session = get_session()
    
    run_id = None
    
    # Helper functions for blocking DB operations
    def _load_flow():
        """Load flow - runs in thread pool."""
        sess = get_session()
        try:
            flow = sess.query(Flow).filter_by(id=flow_id).first()
            if not flow:
                raise ValueError(f"Flow not found: {flow_id}")
            return flow
        finally:
            sess.close()
    
    def _create_run():
        """Create run record - runs in thread pool."""
        sess = get_session()
        try:
            run = FlowRun(
                flow_id=flow_id,
                input_text=input_text,
                status="running"
            )
            sess.add(run)
            sess.commit()
            # Refresh to get the ID
            sess.refresh(run)
            return run.id
        finally:
            sess.close()
    
    def _update_run(run_id, output, trace, duration, status="completed", error_msg=None):
        """Update run record - runs in thread pool."""
        sess = get_session()
        try:
            run_obj = sess.query(FlowRun).filter_by(id=run_id).first()
            if run_obj:
                run_obj.output_json = output
                run_obj.trace_json = trace
                run_obj.status = status
                run_obj.duration_seconds = round(duration, 3)
                if error_msg:
                    run_obj.error_message = error_msg
                sess.commit()
        finally:
            sess.close()
    
    try:
        # Load flow (non-blocking)
        flow = await asyncio.to_thread(_load_flow)
        
        # Create run record (non-blocking)
        run_id = await asyncio.to_thread(_create_run)
        
        # Compile flow to LangGraph (uses session for agent loading, but that's fast)
        model_cache = {}
        graph = compile_flow(flow.yaml_definition, session, model_cache)
        
        # Execute
        start_time = time.time()
        state = {"text": input_text}
        if initial_state:
            state.update(initial_state)
        
        result = await graph.ainvoke(state)
        
        duration = time.time() - start_time
        
        # Extract outputs and traces
        output = _serialize_output(result)
        trace = _collect_traces(result)
        
        # Update run record (non-blocking)
        await asyncio.to_thread(_update_run, run_id, output, trace, duration)
        
        # Write to Neo4j if requested and we have relations
        if write_to_neo4j and "relations" in output:
            try:
                await asyncio.to_thread(_write_to_neo4j, output)
            except Exception as e:
                # Don't fail the run if Neo4j write fails
                print(f"Warning: Failed to write to Neo4j: {e}")
        
        return {
            "run_id": run_id,
            "output": output,
            "trace": trace,
            "duration_seconds": round(duration, 3)
        }
        
    except Exception as e:
        # Update run record with error (non-blocking)
        if run_id:
            try:
                await asyncio.to_thread(_update_run, run_id, {}, {}, 0, status="failed", error_msg=str(e))
            except Exception:
                pass  # Don't fail if error update fails
        raise
        
    finally:
        if own_session:
            session.close()


def _write_to_neo4j(output: Dict) -> None:
    """Write extracted relations to Neo4j."""
    from src.neo4j_client import neo4j_client
    
    relations = output.get("relations", [])
    if not relations:
        return
    
    # Convert to triples format
    triples = []
    for rel in relations:
        if isinstance(rel, dict):
            head = rel.get("head")
            relation = rel.get("relation")
            tail = rel.get("tail")
        else:
            # Handle Pydantic model
            head = getattr(rel, "head", None)
            relation = getattr(rel, "relation", None)
            tail = getattr(rel, "tail", None)
        
        if head and relation and tail:
            triples.append((head, relation, tail))
    
    if triples:
        neo4j_client.write_triples(triples)


def get_flow_run(run_id: int, session: Optional[Session] = None) -> Optional[Dict]:
    """Get a flow run by ID."""
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


def get_flow_runs(
    flow_id: int,
    limit: int = 50,
    session: Optional[Session] = None
) -> list:
    """Get runs for a flow."""
    own_session = session is None
    if own_session:
        session = get_session()
    
    try:
        runs = session.query(FlowRun).filter_by(
            flow_id=flow_id
        ).order_by(FlowRun.created_at.desc()).limit(limit).all()
        
        return [
            {
                "id": r.id,
                "flow_id": r.flow_id,
                "status": r.status,
                "duration_seconds": r.duration_seconds,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in runs
        ]
    finally:
        if own_session:
            session.close()

