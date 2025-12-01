"""
Flow compiler - converts YAML flow definitions into LangGraph state graphs.

The compiler parses YAML, loads referenced agents from DB, and builds
a LangGraph that routes state through each step.
"""

import yaml
from typing import Dict, Any, Type, Callable

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from src.agents.loader import load_agent


def _get_schema_field_names(schema_json: Any) -> set:
    """
    Extract top-level field names from an agent's schema_json definition.
    """
    if not isinstance(schema_json, list):
        return set()
    return {
        f.get("name")
        for f in schema_json
        if isinstance(f, dict) and "name" in f
    }


def get_nested_value(obj: Any, path: str) -> Any:
    """
    Get value from object using dot notation path.
    
    Examples:
        get_nested_value({"a": {"b": 1}}, "a.b") -> 1
        get_nested_value(obj, "output.entities") -> obj.output.entities
    """
    parts = path.split(".")
    current = obj
    
    for part in parts:
        if current is None:
            return None
        if hasattr(current, part):
            current = getattr(current, part)
        elif isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    
    return current


def build_node(
    step: Dict,
    session: Session,
    model_cache: Dict[str, Type]
) -> Callable:
    """
    Build a LangGraph node function from a flow step definition.
    
    Args:
        step: Step definition from YAML, e.g.:
            {
                "id": "extract_entities",
                "agent": "entity_extractor@1",
                "inputs": {"text": "state.text"},
                "outputs": {"entities": "output.entities"}
            }
        session: Database session
        model_cache: Shared Pydantic model cache
        
    Returns:
        Async function suitable for LangGraph node
    """
    agent = load_agent(session, step["agent"], model_cache)
    runnable = agent.build_runnable()
    
    input_mappings = step.get("inputs", {})
    output_mappings = step.get("outputs", {})
    step_id = step["id"]
    
    async def node_fn(state: Dict[str, Any]) -> Dict[str, Any]:
        """Execute agent and map inputs/outputs to/from langgraph state."""
        
        # Start with current state (LangGraph will merge updates)
        updates = dict(state)
        
        # Map inputs from state
        mapped_inputs = {}
        for param_name, state_path in input_mappings.items():
            if state_path.startswith("state."):
                field = state_path.removeprefix("state.")
                mapped_inputs[param_name] = state.get(field)
            else:
                mapped_inputs[param_name] = state_path
        
        result = await runnable.ainvoke(mapped_inputs)
        
        # Map outputs back to state
        for state_key, output_path in output_mappings.items():
            value = get_nested_value(result, output_path)
            updates[state_key] = value
        
        # Store trace info
        trace_key = f"_trace_{step_id}"
        trace_info = result.get("_trace", {})
        trace_info["inputs"] = mapped_inputs
        trace_info["step_id"] = step_id
        updates[trace_key] = trace_info
        
        return updates
    
    return node_fn


def compile_flow(
    flow_yaml: str,
    session: Session,
    model_cache: Dict[str, Type]
) -> Any:
    """
    Compile a YAML flow definition into an executable LangGraph.
    
    Args:
        flow_yaml: YAML string defining the flow, e.g.:
            version: 1
            steps:
              - id: extract_entities
                agent: entity_extractor@1
                inputs:
                  text: state.text
                outputs:
                  entities: output.entities
        session: Database session
        model_cache: Shared Pydantic model cache
        
    Returns:
        Compiled LangGraph ready for execution
        
    Example:
        graph = compile_flow(yaml_str, session, {})
        result = await graph.ainvoke({"text": "Some input text"})
    """
    # Parse YAML
    spec = yaml.safe_load(flow_yaml)
    steps = spec.get("steps", [])
    
    if not steps:
        raise ValueError("Flow has no steps defined")
    
    # Build state graph with dict state
    builder = StateGraph(dict)
    
    # Add a node for each step
    for step in steps:
        if "id" not in step:
            raise ValueError(f"Step missing 'id': {step}")
        if "agent" not in step:
            raise ValueError(f"Step '{step['id']}' missing 'agent'")
        
        node_fn = build_node(step, session, model_cache)
        builder.add_node(step["id"], node_fn)
    
    builder.set_entry_point(steps[0]["id"])
    
    # Add edges between steps (linear flow only for now)
    step_ids = [s["id"] for s in steps]
    for i in range(len(step_ids) - 1):
        builder.add_edge(step_ids[i], step_ids[i + 1])
    
    # Final step goes to END (LangGraph's terminal state)
    builder.add_edge(step_ids[-1], END)
    
    return builder.compile()


def validate_flow(flow_yaml: str, session: Session) -> Dict[str, Any]:
    """
    Validate a flow YAML without compiling it.
    
    Returns:
        Dict with validation results:
        {
            "valid": True/False,
            "errors": ["error message", ...],
            "warnings": ["warning message", ...],
            "steps": [{"id": "...", "agent": "...", "agent_exists": True}, ...]
        }
    """
    errors = []
    warnings = []
    step_info = []
    
    try:
        spec = yaml.safe_load(flow_yaml)
    except yaml.YAMLError as e:
        return {"valid": False, "errors": [f"YAML parse error: {e}"], "warnings": [], "steps": []}
    
    steps = spec.get("steps", [])
    if not steps:
        errors.append("Flow has no steps")
    
    seen_ids = set()
    
    # avoid circular dependencies 
    from src.models import AgentType, AgentVersion
    for i, step in enumerate(steps):
        step_data = {"index": i}
        
        # Check id
        if "id" not in step:
            errors.append(f"Step {i} missing 'id'")
        else:
            step_data["id"] = step["id"]
            if step["id"] in seen_ids:
                errors.append(f"Duplicate step id: {step['id']}")
            seen_ids.add(step["id"])
        
        # Check agent
        if "agent" not in step:
            errors.append(f"Step {i} missing 'agent'")
        else:
            step_data["agent"] = step["agent"]
            
            # Parse agent reference: name or name@version
            agent_ref = step["agent"]
            if "@" in agent_ref:
                agent_name, version_str = agent_ref.split("@", 1)
                try:
                    requested_version = int(version_str)
                except ValueError:
                    requested_version = None
                    errors.append(f"Step {step.get('id', i)} has invalid agent version in '{agent_ref}'")
            else:
                agent_name = agent_ref
                requested_version = None
            
            # Check if agent type exists in DB
            agent_type = session.query(AgentType).filter_by(name=agent_name).first()
            step_data["agent_exists"] = agent_type is not None
            if not agent_type:
                errors.append(f"Agent type not found: {agent_name}")
                step_info.append(step_data)
                continue
            
            # Check that a concrete agent version exists
            version_query = session.query(AgentVersion).filter_by(agent_type_id=agent_type.id)
            if requested_version is not None:
                version = version_query.filter_by(version_number=requested_version).first()
                if not version:
                    errors.append(f"Agent version not found: {agent_name}@{requested_version}")
            else:
                # Use latest version when none specified
                version = version_query.order_by(AgentVersion.version_number.desc()).first()
                if not version:
                    errors.append(f"No versions defined for agent type: {agent_name}")
            
            step_data["version"] = version.version_number if version else None
            step_data["version_exists"] = version is not None
            
            # If we have a version and outputs, validate that mapped fields exist in schema_json
            if version and isinstance(step.get("outputs"), dict):
                schema_fields = _get_schema_field_names(version.schema_json or [])
                
                invalid_fields = []
                for _, output_path in step["outputs"].items():
                    if isinstance(output_path, str) and output_path.startswith("output."):
                        # output.entities -> entities
                        field_name = output_path.split(".", 1)[1]
                        if field_name not in schema_fields:
                            invalid_fields.append(field_name)
                
                if invalid_fields:
                    errors.append(
                        f"Step {step.get('id', i)} maps unknown output fields {sorted(set(invalid_fields))} "
                        f"for agent {agent_name}@{step_data['version']} "
                        f"(schema fields: {sorted(schema_fields)})"
                    )
        
        step_info.append(step_data)
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "steps": step_info
    }

