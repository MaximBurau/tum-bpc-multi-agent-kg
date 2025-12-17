

from typing import List, Tuple, Optional, Union 

from ..llm import (
    LLMClient,
    KnowledgeGraphExtraction, 
    KnowledgeGraphTriple,
    Entity, 
)

Triple = Tuple[str, str, str]

# Use o3-mini for playground (hardcoded) - supports reasoning
_llm = LLMClient(model='openai/gpt-4o-mini')

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

def extract_knowledge_graph(text: str, system_prompt: Optional[str] = None, return_raw: bool = False) -> Union[Tuple[KnowledgeGraphExtraction, Optional[dict]], KnowledgeGraphExtraction]:
    """
    Extract a knowledge graph from a text.
    
    Args:
        text: Input text to extract from
        system_prompt: Optional custom system prompt. If None, uses default.
        return_raw: If True, also return raw LLM response with thinking steps
        
    Returns:
        If return_raw=False: KnowledgeGraphExtraction
        If return_raw=True: (KnowledgeGraphExtraction, raw_response_dict)
    """
    prompt_to_use = system_prompt if system_prompt is not None else _SYSTEM_PROMPT
    
    # Get raw response to capture thinking steps
    messages = []
    if prompt_to_use:
        messages.append({"role": "system", "content": prompt_to_use})
    messages.append({"role": "user", "content": text})
    
    # Call with instructor to get structured output
    structured_output = _llm.instructor_client.chat.completions.create(
        model=_llm.model,
        messages=messages,
        response_model=KnowledgeGraphExtraction,
        temperature=0.0,
    )
    
    if not return_raw:
        return structured_output

    raw_data = {"model": _llm.model}
    try:
        raw_response = _llm.client.chat.completions.create(
            model=_llm.model,
            messages=messages,
            temperature=0.0,
        )

        choice = raw_response.choices[0] if getattr(raw_response, "choices", None) else None
        message = choice.message if choice and hasattr(choice, "message") else None

        if message:
            if getattr(message, "content", None):
                raw_data["content"] = message.content
            if getattr(message, "reasoning", None):
                raw_data["reasoning"] = message.reasoning

        usage = getattr(raw_response, "usage", None)
        raw_data["usage"] = {
            "prompt_tokens": getattr(usage, "prompt_tokens", None),
            "completion_tokens": getattr(usage, "completion_tokens", None),
            "total_tokens": getattr(usage, "total_tokens", None),
        } if usage else None

        raw_data["response_id"] = getattr(raw_response, "id", None)
    except Exception as exc:
        raw_data["error"] = f"Failed to get raw response: {exc}"

    return structured_output, raw_data

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