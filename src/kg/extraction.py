

from typing import List, Tuple 

from ..llm import (
    LLMClient,
    KnowledgeGraphExtraction, 
    KnowledgeGraphTriple,
    Entity, 
)

Triple = Tuple[str, str, str]

# Use GPT-4o for structured outputs (supports function calling)
_llm = LLMClient(model='openai/gpt-4o')

_SYSTEM_PROMPT = """
You are a knowledge graph extraction model.

Given an arbitrary text, you MUST produce:
- a list of entities (unique, canonicalized when possible)
- a list of triples (subject, predicate, object), where:
    - subject and object refer to entities from the entity list
    - predicate is a concise relation phrase

Follow the response schema exactly.
Do NOT include anything that is not directly supported by the text.
"""

def extract_knowledge_graph(text: str) -> KnowledgeGraphExtraction:
    """
    Extract a knowledge graph from a text.
    """
    response = _llm.get_structured_output(
        prompt=text,
        response_model=KnowledgeGraphExtraction,
        system_prompt=_SYSTEM_PROMPT,
        temperature=0.0,
    )
    return response

def extract_triples(text: str) -> List[Triple]:
    """
    Extract triples from a text.
    """
    kg: KnowledgeGraphExtraction = extract_knowledge_graph(text)
    triples: List[Triple] = [
        (triple.subject, triple.predicate, triple.object)
        for triple in kg.triples
    ]
    return triples 

def extract_entities(text: str) -> List[Entity]:
    """
    Extract entities from a text.
    """
    kg: KnowledgeGraphExtraction = extract_knowledge_graph(text)
    return kg.entities 