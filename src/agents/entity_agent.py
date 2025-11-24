
from typing import Type
from pydantic import BaseModel, Field
from .base import StructuredAgent

class Entity(BaseModel):
    name: str = Field(..., description="The name of the entity.")
    type: str = Field(..., description="The type/category of the entity, e.g. person, organization, location.")

class EntityAgent(StructuredAgent):
    """
    Entity extraction agent using LLM structured output.
    Given a prompt (text), extracts a single entity with its name and type.
    """
    name: str = "entity-agent"
    description: str = "Extracts an entity (name and type) from text."
    system_prompt: str = (
        "You are an extraction assistant. From the input text, extract a single entity. "
        "Return the entity name and its type (such as PERSON, ORGANIZATION, LOCATION, PRODUCT, etc). "
        "If multiple candidates are present, return the most salient one."
    )
    response_model: Type[BaseModel] = Entity


