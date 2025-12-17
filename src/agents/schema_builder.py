"""
Dynamic Pydantic model builder.

Converts JSON schema definitions from the database into runtime Pydantic models
using create_model().
"""

from typing import Any, Dict, List, Type
from pydantic import create_model

# mapping for primitive types used by the dashboard schema editor
PRIMITIVES = {
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
}


def parse_type(type_def: Any, model_cache: Dict[str, Type]) -> Type:
    """
    Recursively parse a type definition into a Python type.
    
    Handles:
    - Primitives: "str", "int", "float", "bool"
    - References: "EntityOutput" (looks up in model_cache)
    - Lists: {"type": "list", "items": <inner_type>}
    - Objects: {"type": "object", "fields": [...]}
    
    Args:
        type_def: Type definition (string or dict)
        model_cache: Cache of already-built models for references
        
    Returns:
        Python type suitable for Pydantic field
    """
    # Handle primitive types: "str", "int", etc.
    if isinstance(type_def, str):
        if type_def in PRIMITIVES:
            return PRIMITIVES[type_def]
        # Check if it's a reference to a cached model
        if type_def in model_cache:
            return model_cache[type_def]
        raise ValueError(f"Unknown type: {type_def}")
    
    # Handle complex types (dict with "type" key)
    if isinstance(type_def, dict):
        type_kind = type_def.get("type")
        
        # Check if it's a primitive wrapped in a dict (e.g., {"type": "int"})
        if type_kind in PRIMITIVES:
            return PRIMITIVES[type_kind]
        
        # List type: {"type": "list", "items": <inner>}
        if type_kind == "list":
            inner_type = parse_type(type_def["items"], model_cache)
            return List[inner_type]
        
        # Object type: {"type": "object", "fields": [...]}
        if type_kind == "object":
            fields = {}
            for field_def in type_def.get("fields", []):
                field_name = field_def["name"]
                field_type = parse_type(field_def["type"], model_cache)
                # Use ... (Ellipsis) to mark as required, or None for optional
                default = ... if field_def.get("required", True) else None
                fields[field_name] = (field_type, default)
            
            # Create an anonymous nested model
            nested_model = create_model("NestedModel", **fields)
            return nested_model
        
        raise ValueError(f"Unknown complex type: {type_def}")
    
    raise ValueError(f"Cannot parse type definition: {type_def}")


def build_pydantic_model(
    name: str,
    schema_json: List[Dict],
    model_cache: Dict[str, Type]
) -> Type:
    """
    Build a Pydantic model from a JSON schema definition.
    
    Args:
        name: Name for the generated model
        schema_json: List of field definitions, e.g.:
            [
                {"name": "entities", "type": {"type": "list", "items": {...}}},
                {"name": "confidence", "type": "float"}
            ]
        model_cache: Cache to store/lookup referenced models
        
    Returns:
        Dynamically created Pydantic model class

    """
    fields = {}
    
    for field_def in schema_json:
        field_name = field_def["name"]
        field_type = parse_type(field_def["type"], model_cache)
        # Mark all top-level fields as required by default
        default = ... if field_def.get("required", True) else None
        fields[field_name] = (field_type, default)
    
    # Create the model and cache it
    Model = create_model(name, **fields)
    model_cache[name] = Model
    
    return Model

