"""
LLM client module for multi-agent knowledge graph construction.

Provides OpenRouter API integration with instructor library for structured outputs.
"""

from typing import Optional, List, Type, TypeVar
from openai import OpenAI
import instructor
from pydantic import BaseModel
from config import config

# Validate config on import
config.validate()

# Type variable for Pydantic models
T = TypeVar('T', bound=BaseModel)


class LLMClient:
    """
    Client for interacting with OpenRouter API via OpenAI SDK.
    
    Supports both structured outputs (using instructor + Pydantic) and
    regular text completions.
    """
    
    OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
    DEFAULT_MODEL = "openai/gpt-4o"
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None
    ):
        """
        Initialize the LLM client.
        
        Args:
            api_key: OpenRouter API key. Uses config if not provided.
            model: Model to use. Defaults to gpt-4o.
            base_url: API base URL. Defaults to OpenRouter endpoint.
        """
        self.api_key = api_key or config.openrouter_api_key
        self.model = model or self.DEFAULT_MODEL
        self.base_url = base_url or self.OPENROUTER_BASE_URL
        
        # Initialize OpenAI client with OpenRouter base URL
        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            default_headers={
                "HTTP-Referer": "https://github.com/your-org/tum-bpc-multi-agent-kg",
                "X-Title": "Multi-Agent Knowledge Graph Construction",
            }
        )
        
        # Patch client with instructor for structured outputs
        self.instructor_client = instructor.patch(self.client)
    
    def get_structured_output(
        self,
        prompt: str,
        response_model: Type[T],
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> T:
        """
        Get structured output from LLM using Pydantic model.
        
        Args:
            prompt: User prompt/instruction
            response_model: Pydantic model class for structured output
            system_prompt: Optional system message
            model: Optional model override
            **kwargs: Additional parameters (temperature, max_tokens, etc.)
            
        Returns:
            Instance of response_model with validated data
            
        Example:
            >>> from pydantic import BaseModel
            >>> class Entity(BaseModel):
            ...     name: str
            ...     type: str
            >>> client = LLMClient()
            >>> entity = client.get_structured_output(
            ...     "Extract entity: Apple is a tech company",
            ...     Entity
            ... )
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        model_to_use = model or self.model
        
        response = self.instructor_client.chat.completions.create(
            model=model_to_use,
            messages=messages,
            response_model=response_model,
            **kwargs
        )
        
        return response
    
    def get_completion(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        Get regular text completion from LLM.
        
        Args:
            prompt: User prompt/instruction
            system_prompt: Optional system message
            model: Optional model override
            **kwargs: Additional parameters (temperature, max_tokens, etc.)
            
        Returns:
            Generated text response
            
        Example:
            >>> client = LLMClient()
            >>> response = client.get_completion("What is AI?")
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        model_to_use = model or self.model
        
        response = self.client.chat.completions.create(
            model=model_to_use,
            messages=messages,
            **kwargs
        )
        
        return response.choices[0].message.content


# Example Pydantic models for knowledge graph construction

class Entity(BaseModel):
    """Represents an entity extracted from text."""
    name: str
    type: str
    description: Optional[str] = None


class Relation(BaseModel):
    """Represents a relation between entities."""
    subject: str
    predicate: str
    object: str
    confidence: Optional[float] = None


class EntityList(BaseModel):
    """List of entities extracted from text."""
    entities: List[Entity]


class RelationList(BaseModel):
    """List of relations extracted from text."""
    relations: List[Relation]


class KnowledgeGraphTriple(BaseModel):
    """A single knowledge graph triple (subject, predicate, object)."""
    subject: str
    predicate: str
    object: str
    subject_type: Optional[str] = None
    object_type: Optional[str] = None


class KnowledgeGraphExtraction(BaseModel):
    """Complete knowledge graph extraction result."""
    entities: List[Entity]
    triples: List[KnowledgeGraphTriple]
