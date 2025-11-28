# src/agents/vanilla_re_agent.py

from typing import List, Dict, Optional, Type, TYPE_CHECKING
from pydantic import BaseModel
import instructor

from .base import StructuredAgent
from ..llm import LLMClient

# Avoid circular import - KGPrediction is only used for type hints
if TYPE_CHECKING:
    from ..eval.redocred import KGPrediction
else:
    # Import at runtime to avoid circular dependency
    KGPrediction = None


class VanillaRelationExtractionAgent(StructuredAgent):
    """
    Vanilla relation extraction agent using the same prompt as the original
    extract_relations_llm() function in redocred.py.
    
    Extracts entities and relations from text using structured LLM output.
    """

    name: str = "vanilla-re-agent"
    description: str = "Vanilla relation extraction agent using Re-DocRED schema"
    # response_model will be set in __init__ to avoid circular import
    response_model: Type[BaseModel] = BaseModel

    def __init__(
        self,
        relation_labels: List[str],
        rel_descriptions: Optional[Dict[str, str]] = None,
        llm_client: Optional[LLMClient] = None,
    ):
        """
        Initialize the vanilla relation extraction agent.

        Args:
            relation_labels: List of allowed relation IDs (e.g. ["P17", "P27", ...])
            rel_descriptions: Optional mapping from relation ID to description
            llm_client: Optional LLM client (creates new one if not provided)
        """
        # Import here to avoid circular dependency
        from ..eval.redocred import KGPrediction
        self.response_model = KGPrediction
        
        super().__init__(llm_client)
        
        # Patch instructor client to use JSON mode (same as in redocred.py)
        # This is required for List[Relation] support
        self.llm.instructor_client = instructor.patch(self.llm.client, mode=instructor.Mode.JSON)
        
        # Deduplicate and sort allowed relation labels
        self.allowed_ids = sorted(set(relation_labels))
        self.rel_descriptions = rel_descriptions or {}
        
        # Build system prompt (same as in extract_relations_llm)
        if self.rel_descriptions:
            allowed_relations_str = "\n".join(
                f"- {r}: {self.rel_descriptions.get(r, '')}" for r in self.allowed_ids
            )
        else:
            allowed_relations_str = "\n".join(f"- {r}" for r in self.allowed_ids)

        self.system_prompt = (
            "You are an information extraction model that builds a small knowledge graph from a document.\n\n"
            "Schema:\n"
            "- Entity types (choose exactly one for each entity):\n"
            "  PER: Person (individual human)\n"
            "  ORG: Organization (companies, institutions, teams, parties, etc.)\n"
            "  LOC: Location (countries, cities, regions, buildings, rivers, mountains, etc.)\n"
            "  TIME: Dates and time expressions (years, specific dates, periods)\n"
            "  NUM: Numeric expressions (numbers, quantities, percentages, monetary amounts)\n"
            "  MISC: Other named entities that do not clearly fit above.\n\n"
            "- Relation types (closed world): you MUST choose relation_id from this list:\n"
            f"{allowed_relations_str}\n\n"
            "Task:\n"
            "1) Read the document text.\n"
            "2) Identify named entities and group mentions that refer to the same real-world entity.\n"
            "3) Assign each entity an entity type from {PER, ORG, LOC, TIME, NUM, MISC}.\n"
            "4) Predict factual relations between entities using ONLY the allowed relation_ids.\n"
            "   - Only output a relation if it is directly supported by the document text.\n"
            "   - Do NOT rely on external world knowledge.\n"
            "   - For each relation, also return evidence_sentences: indices of sentences that justify it (0-based).\n\n"
            "Output format:\n"
            "Return a single JSON object with the following structure (no extra fields):\n"
            "{\n"
            "  \"entities\": [\n"
            "    {\n"
            "      \"entity_id\": \"string, e.g. 'E1'\",\n"
            "      \"type\": \"one of: PER, ORG, LOC, TIME, NUM, MISC\",\n"
            "      \"canonical_name\": \"short canonical name for the entity\",\n"
            "      \"mentions\": [\n"
            "        {\n"
            "          \"mention_id\": \"string, e.g. 'M1'\",\n"
            "          \"text\": \"exact text span of this mention\",\n"
            "          \"sent_index\": 0,\n"
            "          \"start_token\": 0,\n"
            "          \"end_token\": 1\n"
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ],\n"
            "  \"relations\": [\n"
            "    {\n"
            "      \"head_entity_id\": \"entity_id of the subject\",\n"
            "      \"tail_entity_id\": \"entity_id of the object\",\n"
            "      \"relation_id\": \"one of the allowed relation ids, e.g. 'P27'\",\n"
            "      \"evidence_sentences\": [0]\n"
            "    }\n"
            "  ]\n"
            "}\n\n"
            "If there are no entities, return \"entities\": [].\n"
            "If there are no supported relations, return \"relations\": [].\n"
            "The output MUST be valid JSON and follow the schema exactly."
        )

    def run(
        self,
        text: str,
        *,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = 3500,
        **kwargs
    ) -> KGPrediction:
        """
        Extract relations from text using the vanilla prompt.

        Args:
            text: Document text to extract relations from
            model: Optional model override
            temperature: Optional temperature override (defaults to 0.0)
            max_tokens: Optional max_tokens override (defaults to 3500)
            **kwargs: Additional parameters passed to get_structured_output

        Returns:
            KGPrediction with entities and relations

        Raises:
            Exception: If LLM call fails (non-token-limit errors are re-raised)
        """
        from ..eval.redocred import KGPrediction  # Import here to ensure it's available
        
        model_final = model if model is not None else self.default_model
        temp_final = temperature if temperature is not None else self.default_temperature

        # Add max_tokens to kwargs if provided
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens

        result = self.llm.get_structured_output(
            prompt=text,
            response_model=self.response_model,
            system_prompt=self.system_prompt,
            model=model_final,
            temperature=temp_final,
            **kwargs
        )
        return result

