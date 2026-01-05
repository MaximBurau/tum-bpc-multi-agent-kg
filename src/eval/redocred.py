# src/eval/redocred.py

from __future__ import annotations

from enum import Enum
from typing import List, Dict, Any, Tuple, Set, Optional
from pathlib import Path
import json
import string

from pydantic import BaseModel, Field

from ..llm import LLMClient
from ..agents.base import BaseAgent

import instructor

_llm = LLMClient()
# Patch instructor client to use JSON mode for List[Relation] support
_llm.instructor_client = instructor.patch(_llm.client, mode=instructor.Mode.JSON)


class EntityType(str, Enum):
    """Coarse entity types used for Re-DocRED-style extraction."""

    PER = "PER"  # Person
    ORG = "ORG"  # Organization
    LOC = "LOC"  # Location (geo / political)
    TIME = "TIME"  # Date / time expressions
    NUM = "NUM"  # Numeric expressions
    MISC = "MISC"  # Other named entities


class PredictedMention(BaseModel):
    """One textual mention of an entity in the document."""

    mention_id: str
    text: str
    sent_index: Optional[int] = None
    start_token: Optional[int] = None
    end_token: Optional[int] = None


class PredictedEntity(BaseModel):
    """Canonical entity plus all its mentions."""

    entity_id: str
    type: EntityType
    canonical_name: str
    mentions: List[PredictedMention] = Field(default_factory=list)


class PredictedRelation(BaseModel):
    """One relation instance between two entities in the closed DocRED schema."""

    head_entity_id: str
    tail_entity_id: str
    # Keep relation_id as a string and enforce allowed values via the prompt
    relation_id: str
    evidence_sentences: List[int] = Field(default_factory=list)


class KGPrediction(BaseModel):
    """Full LLM prediction for one document: entities + relations."""

    entities: List[PredictedEntity] = Field(default_factory=list)
    relations: List[PredictedRelation] = Field(default_factory=list)


def _normalize_text(text: str) -> str:
    """
    Simple normalization for matching entity surface forms:
    - lowercase
    - strip leading/trailing punctuation
    - collapse internal whitespace
    """
    text = text.lower().strip()
    text = text.strip(string.punctuation)
    text = " ".join(text.split())
    return text


def load_redocred(path: str) -> List[Dict[str, Any]]:
    """
    Load a Re-DocRED-style JSON file (e.g. dev_revised.json).

    Expected top-level: a list of documents.
    Each document has at least:
      - "sents": List[List[str]]
      - "vertexSet": List[List[mention_dict]]
      - "labels": List[{"h": int, "t": int, "r": str, ...}]  (for dev/train)

    We do not touch test files without labels.
    """
    with open(path, "r", encoding="utf8") as f:
        docs = json.load(f)

    # Basic sanity checks (non-fatal)
    for doc in docs[:3]:
        assert "sents" in doc, "Missing 'sents' in Re-DocRED doc"
        assert "vertexSet" in doc, "Missing 'vertexSet' in Re-DocRED doc"
        # labels might be missing only for test data; for eval we expect them
        if "labels" not in doc:
            raise ValueError("This Re-DocRED file has no 'labels'; use a train/dev file.")

    return docs


def load_rel_info() -> Dict[str, str]:
    """Load mapping from relation id (e.g. 'P27') to human-readable label.

    This is used only for prompting; evaluation is still done on raw ids.
    """
    rel_info_path = (
        Path(__file__).parent.parent.parent
        / "data"
        / "eval"
        / "redocred"
        / "raw"
        / "rel_info.json"
    )

    with open(rel_info_path, "r", encoding="utf8") as f:
        return json.load(f)


def build_gold_triples(doc: Dict[str, Any], rel_info: Optional[Dict[str, str]] = None) -> Set[Tuple[str, str, str]]:
    """
    Convert a Re-DocRED document into a set of gold triples:

      (normalized_subject_surface_text, relation_label, normalized_object_surface_text)

    Strategy:
      - Each entry in vertexSet is an entity cluster (coref).
      - We take the *first* mention in the cluster as the canonical form.
      - labels[i] gives: h (head idx), t (tail idx), r (relation id string).
      - If rel_info is provided, converts relation IDs to human-readable names.
    
    Args:
        doc: Re-DocRED document
        rel_info: Optional mapping from relation ID to human-readable name (e.g., {"P27": "country of citizenship"})
    
    Returns:
        Set of (subject, relation, object) triples with human-readable relations if rel_info provided
    """
    vertex_set = doc["vertexSet"]
    labels = doc.get("labels", [])

    # Canonical entity surface forms: first mention in each cluster
    canon_names: List[str] = []
    for ent_cluster in vertex_set:
        if not ent_cluster:
            canon_names.append("")
            continue
        first_mention = ent_cluster[0]
        name = first_mention.get("name") or ""
        canon_names.append(name)

    gold_triples: Set[Tuple[str, str, str]] = set()

    for lab in labels:
        h = lab["h"]
        t = lab["t"]
        r = lab["r"]  # relation label / id string

        if h >= len(canon_names) or t >= len(canon_names):
            # corrupted indices; skip
            continue

        subj = _normalize_text(canon_names[h])
        obj = _normalize_text(canon_names[t])

        if not subj or not obj:
            continue

        # Convert relation ID to human-readable name if rel_info provided
        if rel_info and r in rel_info:
            relation_name = rel_info[r]
        else:
            relation_name = r  # Fallback to ID if mapping not found

        gold_triples.add((subj, relation_name, obj))

    return gold_triples


def extract_relations_llm(
    text: str,
    relation_labels: List[str],
    rel_descriptions: Optional[Dict[str, str]] = None,
) -> Tuple[List[Tuple[str, str, str]], Optional[str]]:
    """Run a dedicated RE prompt on plain text using LLM structured output.

    Uses the KGPrediction schema defined above:
      - entities: canonical entities with mentions
      - relations: links between entity_ids using relation_ids from Re-DocRED

    We then collapse this back down to a set of triples:
      (normalized_subject_surface_text, relation_label, normalized_object_surface_text)
    for comparison against gold triples.
    
    Returns:
        Tuple of (triples_list, error_message). error_message is None if successful,
        or a string like "Token limit reached" if the output was incomplete.
    """
    # Deduplicate and sort allowed relation labels (e.g. ["P17", "P27", ...])
    allowed_ids = sorted(set(relation_labels))

    if rel_descriptions:
        allowed_relations_str = "\n".join(
            f"- {r}: {rel_descriptions.get(r, '')}" for r in allowed_ids
        )
    else:
        allowed_relations_str = "\n".join(f"- {r}" for r in allowed_ids)

    system_prompt = (
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

    try:
        pred_kg: KGPrediction = _llm.get_structured_output(
            prompt=text,
            response_model=KGPrediction,
            system_prompt=system_prompt,
            temperature=0.0,
            #max_tokens=3500,
        )
    except Exception as e:
        # Check if it's a token limit error
        error_str = str(e)
        if "incomplete" in error_str.lower() or "max_tokens" in error_str.lower() or "length limit" in error_str.lower():
            print(f"Warning: Token limit reached for document. Returning empty triples.")
            return [], "Token limit reached"
        else:
            # Re-raise unexpected errors
            raise

    # Convert KGPrediction to triples using shared helper function
    triples = _kgprediction_to_triples(pred_kg, allowed_ids)
    return triples, None


def _kgprediction_to_triples(
    pred_kg: KGPrediction,
    relation_labels: List[str],
) -> List[Tuple[str, str, str]]:
    """
    Convert a KGPrediction to a list of normalized triples.
    
    This is a helper function used by both extract_relations_llm and extract_relations_with_agent.
    
    Args:
        pred_kg: KGPrediction with entities and relations
        relation_labels: List of allowed relation IDs (for filtering)
    
    Returns:
        List of (subject, relation_id, object) triples
    """
    # Map entity_id -> canonical surface form
    entity_map: Dict[str, PredictedEntity] = {e.entity_id: e for e in pred_kg.entities}

    triples: List[Tuple[str, str, str]] = []
    seen: Set[Tuple[str, str, str]] = set()
    allowed_set = set(relation_labels)

    for rel in pred_kg.relations:
        # Enforce closed-world relation set
        if rel.relation_id not in allowed_set:
            continue

        head = entity_map.get(rel.head_entity_id)
        tail = entity_map.get(rel.tail_entity_id)
        if head is None or tail is None:
            continue

        # Prefer canonical_name; fall back to first mention text
        subj_name = head.canonical_name or (head.mentions[0].text if head.mentions else "")
        obj_name = tail.canonical_name or (tail.mentions[0].text if tail.mentions else "")

        subj = _normalize_text(subj_name)
        obj = _normalize_text(obj_name)
        pred = rel.relation_id.strip()
        
        # Convert relation ID to human-readable name if rel_info provided
        # Note: This is for the entity-based path, rel_info would need to be passed through
        # For now, we'll handle this in the calling function

        if not subj or not obj or not pred:
            continue

        triple = (subj, pred, obj)
        if triple in seen:
            continue
        seen.add(triple)
        triples.append(triple)

    return triples


def _flow_output_to_triples(
    flow_output: Dict[str, Any],
    relation_labels: List[str],
    rel_info: Optional[Dict[str, str]] = None,
) -> List[Tuple[str, str, str]]:
    """
    Convert flow output (from LangGraph state) to triples.
    
    Flow output should have 'entities' and 'relations' keys matching KGPrediction structure.
    This function handles both Pydantic models and dict representations.
    
    Supports multiple relation formats:
    - PredictedRelation format: head_entity_id, tail_entity_id, relation_id
    - Simple triple format: subject/predicate/object or head/relation/tail
    
    Args:
        flow_output: Dict from flow execution with 'entities' and 'relations' keys
        relation_labels: List of allowed relation IDs (for filtering)
    
    Returns:
        List of (subject, relation_id, object) triples
    """
    # Debug: Print flow output structure
    print(f"[DEBUG] Flow output keys: {list(flow_output.keys())}")
    print(f"[DEBUG] Relations data type: {type(flow_output.get('relations', []))}")
    print(f"[DEBUG] Relations data length: {len(flow_output.get('relations', []))}")
    if flow_output.get('relations'):
        print(f"[DEBUG] First relation sample: {flow_output['relations'][0] if len(flow_output['relations']) > 0 else 'N/A'}")
    
    # Extract entities and relations from flow output
    # Flow output might have them directly or nested
    entities_data = flow_output.get("entities", [])
    relations_data = flow_output.get("relations", [])
    
    # Convert to KGPrediction format if needed
    # Handle both dict and Pydantic model representations
    entities = []
    for e in entities_data:
        if isinstance(e, dict):
            # Convert dict to PredictedEntity
            mentions = [
                PredictedMention(**m) if isinstance(m, dict) else m
                for m in e.get("mentions", [])
            ]
            entities.append(PredictedEntity(
                entity_id=e.get("entity_id", ""),
                type=e.get("type", "MISC"),
                canonical_name=e.get("canonical_name", ""),
                mentions=mentions
            ))
        else:
            # Already a Pydantic model
            entities.append(e)
    
    # Check if relations are in simple triple format (subject/predicate/object or head/relation/tail)
    # If so, we can convert them directly without needing entity mapping
    if relations_data and isinstance(relations_data[0], dict):
        first_rel = relations_data[0]
        if "subject" in first_rel or ("head" in first_rel and "relation" in first_rel):
            # Simple triple format - convert directly
            print(f"[DEBUG] Detected simple triple format (subject/predicate/object or head/relation/tail)")
            triples = []
            for r in relations_data:
                if isinstance(r, dict):
                    subject = r.get("subject") or r.get("head", "")
                    predicate = r.get("predicate") or r.get("relation", "")
                    obj = r.get("object") or r.get("tail", "")
                    
                    if subject and predicate and obj:
                        # Convert relation ID to human-readable name if rel_info provided and predicate is an ID
                        if rel_info and predicate in rel_info:
                            predicate = rel_info[predicate]
                        
                        # Normalize and create triple
                        triple = (_normalize_text(subject), predicate.strip(), _normalize_text(obj))
                        triples.append(triple)
            
            print(f"[DEBUG] Converted {len(triples)} triples from simple format")
            return triples
    
    # Otherwise, use the entity-based conversion
    relations = []
    for r in relations_data:
        if isinstance(r, dict):
            # Check if it's in simple triple format (subject/predicate/object or head/relation/tail)
            if "subject" in r or "head" in r:
                # Simple triple format - convert to PredictedRelation format
                # Extract subject/head and object/tail
                subject = r.get("subject") or r.get("head", "")
                predicate = r.get("predicate") or r.get("relation", "")
                obj = r.get("object") or r.get("tail", "")
                
                # For simple triples, we need to match entities by name
                # Find entity IDs that match the subject and object
                subject_entity_id = None
                object_entity_id = None
                
                for entity in entities:
                    entity_name = entity.canonical_name if hasattr(entity, 'canonical_name') else entity.get("canonical_name", "")
                    if not entity_name and hasattr(entity, 'mentions') and entity.mentions:
                        entity_name = entity.mentions[0].text if hasattr(entity.mentions[0], 'text') else entity.mentions[0].get("text", "")
                    
                    # Normalize for comparison
                    if _normalize_text(entity_name) == _normalize_text(subject):
                        subject_entity_id = entity.entity_id if hasattr(entity, 'entity_id') else entity.get("entity_id", "")
                    if _normalize_text(entity_name) == _normalize_text(obj):
                        object_entity_id = entity.entity_id if hasattr(entity, 'entity_id') else entity.get("entity_id", "")
                
                # If we found matching entities, create PredictedRelation
                if subject_entity_id and object_entity_id:
                    relations.append(PredictedRelation(
                        head_entity_id=subject_entity_id,
                        tail_entity_id=object_entity_id,
                        relation_id=predicate,
                        evidence_sentences=[]
                    ))
                else:
                    # If no matching entities, create temporary entity IDs
                    # This allows the triple to be converted even without full entity mapping
                    temp_subj_id = f"temp_subj_{subject}"
                    temp_obj_id = f"temp_obj_{obj}"
                    
                    # Add temporary entities if they don't exist
                    if not any(e.entity_id == temp_subj_id if hasattr(e, 'entity_id') else e.get("entity_id") == temp_subj_id for e in entities):
                        entities.append(PredictedEntity(
                            entity_id=temp_subj_id,
                            type="MISC",
                            canonical_name=subject,
                            mentions=[PredictedMention(text=subject, sent_id=0)]
                        ))
                    if not any(e.entity_id == temp_obj_id if hasattr(e, 'entity_id') else e.get("entity_id") == temp_obj_id for e in entities):
                        entities.append(PredictedEntity(
                            entity_id=temp_obj_id,
                            type="MISC",
                            canonical_name=obj,
                            mentions=[PredictedMention(text=obj, sent_id=0)]
                        ))
                    
                    relations.append(PredictedRelation(
                        head_entity_id=temp_subj_id,
                        tail_entity_id=temp_obj_id,
                        relation_id=predicate,
                        evidence_sentences=[]
                    ))
            else:
                # Standard PredictedRelation format
                relations.append(PredictedRelation(
                    head_entity_id=r.get("head_entity_id", ""),
                    tail_entity_id=r.get("tail_entity_id", ""),
                    relation_id=r.get("relation_id", ""),
                    evidence_sentences=r.get("evidence_sentences", [])
                ))
        else:
            relations.append(r)
    
    # Create KGPrediction and use existing conversion function
    pred_kg = KGPrediction(entities=entities, relations=relations)
    triples = _kgprediction_to_triples(pred_kg, relation_labels)
    
    # Convert relation IDs to human-readable names if rel_info provided
    if rel_info:
        triples = [
            (subj, rel_info.get(pred, pred), obj)  # Use human-readable name if available, else keep original
            for subj, pred, obj in triples
        ]
    
    return triples


async def extract_relations_with_agent(
    text: str,
    agent: BaseAgent,
    relation_labels: List[str],
    rel_descriptions: Optional[Dict[str, str]] = None,
) -> Tuple[List[Tuple[str, str, str]], Optional[str]]:
    """
    Extract relations from text using an agent.
    
    The agent should return a KGPrediction when called with the text.
    This function handles the conversion to triples and error handling.
    
    Args:
        text: Document text to extract relations from
        agent: Agent that implements run() and returns KGPrediction
        relation_labels: List of allowed relation IDs (for filtering)
        rel_descriptions: Optional relation descriptions (not used here, but kept for API consistency)
    
    Returns:
        Tuple of (triples_list, error_message). error_message is None if successful,
        or a string like "Token limit reached" if the output was incomplete.
    """
    try:
        # Call the agent - it should return a KGPrediction
        # Run in thread pool to avoid blocking event loop since agent.run is synchronous
        import asyncio
        pred_kg: KGPrediction = await asyncio.to_thread(
            agent.run, text, temperature=0.0, max_tokens=3500
        )
    except Exception as e:
        # Check if it's a token limit error
        error_str = str(e)
        if "incomplete" in error_str.lower() or "max_tokens" in error_str.lower() or "length limit" in error_str.lower():
            print(f"Warning: Token limit reached for document. Returning empty triples.")
            return [], "Token limit reached"
        else:
            # Re-raise unexpected errors
            raise

    # Convert KGPrediction to triples
    triples = _kgprediction_to_triples(pred_kg, relation_labels)
    return triples, None


async def evaluate_redocred_re(
    path: str | None = None,
    limit: int | None = None,
    return_details: bool = False,
    agent: Optional[BaseAgent] = None,
    flow_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Evaluate relation extraction quality on Re-DocRED using an agent or direct LLM call.

    Pipeline:
      1. Load Re-DocRED docs from JSON.
      2. For each doc, build:
           - plain-text document from 'sents'
           - gold triples from 'vertexSet' + 'labels'
      3. Build the global list of relation labels present in the dataset
         and feed them to the LLM/agent as allowed predicates.
      4. Run extraction (via agent or direct LLM) → predicted triples.
      5. Compare predicted vs gold triples as sets of
         (normalized_subject, relation_label, normalized_object).
         -> micro precision / recall / F1.

    Args:
        path: Path to Re-DocRED JSON file
        limit: Limit number of documents to evaluate
        return_details: If True, return per-document details (text, predicted triples, gold triples)
        agent: Optional agent to use for extraction. If None, uses direct LLM call (extract_relations_llm).
               If provided, uses extract_relations_with_agent. If agent is None, a default
               VanillaRelationExtractionAgent will be created automatically.
        flow_id: Optional flow ID to use for extraction. If provided, runs the flow instead of agent.
                 flow_id takes precedence over agent.

    Returns:
        Dictionary with metrics and optionally detailed per-document results
    """
    if path is None:    
        path = str(
            Path(__file__).parent.parent.parent / "data" / "eval" / "redocred" / "raw" / "dev_revised.json"
        )

    docs = load_redocred(path)
    if limit is not None:
        docs = docs[:limit]

    rel_info = load_rel_info()

    # Collect all relation labels present in the (sub-)dataset
    all_rel_labels = sorted(
        {lab["r"] for doc in docs for lab in doc.get("labels", [])}
    )

    # If flow_id provided, use flow execution instead of agent
    if flow_id is not None:
        from ..flow.runner import run_flow
        from ..db import get_session
        from ..models import Flow
        
        session = get_session()
        try:
            flow = session.query(Flow).filter_by(id=flow_id).first()
            if not flow:
                raise ValueError(f"Flow not found: {flow_id}")
        finally:
            session.close()
        
        # Use flow execution path
        tp = 0
        fp = 0
        fn = 0
        doc_details = [] if return_details else None
        num_evaluated_docs = 0
        skipped_docs = 0
        
        # Format relation labels once for all documents
        relation_labels_str = "\n".join(f"- {r}" for r in all_rel_labels)
        
        async def process_document(doc_idx: int, doc: Dict[str, Any]) -> Dict[str, Any]:
            """Process a single document and return its results."""
            try:
                # 1) Build gold triples (with human-readable relation names)
                gold_triples = build_gold_triples(doc, rel_info=rel_info)
                
                # 2) Reconstruct plain text
                sents = doc["sents"]
                text = " ".join(" ".join(sent) for sent in sents)
                
                # 3) Run flow with relation_labels in state
                try:
                    # Run flow - state needs text and relation_labels (for prompt formatting)
                    result = await run_flow(
                        flow_id=flow_id,
                        input_text=text,
                        write_to_neo4j=False,  # Don't write during eval
                        session=None,
                        initial_state={"relation_labels": relation_labels_str}
                    )
                    
                    # Extract output from flow result
                    flow_output = result.get("output", {})
                    
                    # Convert flow output to triples (with human-readable relation names)
                    pred_triples_list = _flow_output_to_triples(flow_output, all_rel_labels, rel_info=rel_info)
                    error_message = None
                    
                except Exception as e:
                    error_str = str(e)
                    if "token limit" in error_str.lower() or "max_tokens" in error_str.lower():
                        return {
                            "doc_index": doc_idx,
                            "skipped": True,
                            "error": "Token limit reached"
                        }
                    else:
                        # For other errors, log and continue
                        print(f"Error processing document {doc_idx + 1}: {error_str}")
                        pred_triples_list = []
                        error_message = error_str
                
                pred_triples = set(pred_triples_list)
                
                # 4) Set-based counts
                doc_tp = len(pred_triples & gold_triples)
                doc_fp = len(pred_triples - gold_triples)
                doc_fn = len(gold_triples - pred_triples)
                
                return {
                    "doc_index": doc_idx,
                    "skipped": False,
                    "text": text if return_details else None,
                    "predicted_triples": [list(t) for t in pred_triples_list] if return_details else pred_triples_list,
                    "gold_triples": [list(t) for t in gold_triples] if return_details else None,
                    "true_positives": doc_tp,
                    "false_positives": doc_fp,
                    "false_negatives": doc_fn,
                    "error": error_message,
                }
            except Exception as e:
                print(f"Unexpected error processing document {doc_idx + 1}: {e}")
                return {
                    "doc_index": doc_idx,
                    "skipped": True,
                    "error": str(e)
                }
        
        # Process all documents in parallel with concurrency limit
        import asyncio
        # Limit concurrent requests to avoid overwhelming API (10 at a time)
        semaphore = asyncio.Semaphore(10)
        
        async def process_with_limit(doc_idx: int, doc: Dict[str, Any]) -> Dict[str, Any]:
            async with semaphore:
                return await process_document(doc_idx, doc)
        
        tasks = [process_with_limit(doc_idx, doc) for doc_idx, doc in enumerate(docs)]
        results = await asyncio.gather(*tasks)
        
        # Aggregate results
        for result in results:
            if result.get("skipped"):
                skipped_docs += 1
                if return_details:
                    doc_details.append({
                        "doc_index": result["doc_index"],
                        "text": result.get("text", ""),
                        "predicted_triples": [],
                        "gold_triples": [],
                        "true_positives": 0,
                        "false_positives": 0,
                        "false_negatives": 0,
                        "error": result.get("error"),
                    })
                continue
            
            doc_tp = result["true_positives"]
            doc_fp = result["false_positives"]
            doc_fn = result["false_negatives"]
            
            tp += doc_tp
            fp += doc_fp
            fn += doc_fn
            num_evaluated_docs += 1
            
            # Store per-document details if requested
            if return_details:
                doc_details.append({
                    "doc_index": result["doc_index"],
                    "text": result["text"],
                    "predicted_triples": result["predicted_triples"],
                    "gold_triples": result["gold_triples"],
                    "true_positives": doc_tp,
                    "false_positives": doc_fp,
                    "false_negatives": doc_fn,
                    "error": result.get("error"),
                })
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (
            2 * precision * recall / (precision + recall)
            if (precision + recall) > 0
            else 0.0
        )
        
        result = {
            "num_docs": int(num_evaluated_docs),
            "num_docs_total": int(len(docs)),
            "num_docs_skipped": int(skipped_docs),
            "true_positives": int(tp),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }
        
        if return_details:
            result["doc_details"] = doc_details
        
        return result
    
    # If no agent provided, create a default VanillaRelationExtractionAgent
    if agent is None:
        from ..agents.vanilla_re_agent import VanillaRelationExtractionAgent
        agent = VanillaRelationExtractionAgent(
            relation_labels=all_rel_labels,
            rel_descriptions=rel_info
        )

    tp = 0
    fp = 0
    fn = 0
    doc_details = [] if return_details else None
    num_evaluated_docs = 0  # Track successfully evaluated documents (excluding token limit errors)
    skipped_docs = 0  # Track documents skipped due to token limit

    for doc_idx, doc in enumerate(docs):
        # 1) Build gold triples
        gold_triples = build_gold_triples(doc, rel_info=rel_info)

        # 2) Reconstruct plain text
        sents = doc["sents"]
        text = " ".join(" ".join(sent) for sent in sents)

        # 3) Extract relations using agent
        pred_triples_list, error_message = await extract_relations_with_agent(
            text, agent, all_rel_labels, rel_descriptions=rel_info
        )
        
        # 4) Skip document if token limit was reached
        if error_message and ("token limit" in error_message.lower() or "max_tokens" in error_message.lower()):
            print(f"Skipping document {doc_idx + 1} due to token limit error. Continuing with next document.")
            skipped_docs += 1
            continue  # Skip this document and move to next one (don't store any info)
        
        pred_triples = set(pred_triples_list)

        # 5) Set-based counts (only for successfully evaluated documents)
        doc_tp = len(pred_triples & gold_triples)
        doc_fp = len(pred_triples - gold_triples)
        doc_fn = len(gold_triples - pred_triples)
        
        tp += doc_tp
        fp += doc_fp
        fn += doc_fn
        num_evaluated_docs += 1  # Count this as successfully evaluated

        # Store per-document details if requested
        if return_details:
            doc_details.append({
                "doc_index": doc_idx,
                "text": text,
                "predicted_triples": [list(t) for t in pred_triples_list],  # Convert tuples to lists for JSON
                "gold_triples": [list(t) for t in gold_triples],  # Convert tuples to lists for JSON
                "true_positives": doc_tp,
                "false_positives": doc_fp,
                "false_negatives": doc_fn,
                "error": error_message,  # Store error message if any (should be None for successful extractions)
            })

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    result = {
        "num_docs": int(num_evaluated_docs),  # Only count successfully evaluated documents
        "num_docs_total": int(len(docs)),  # Total documents processed (including skipped)
        "num_docs_skipped": int(skipped_docs),  # Number of documents skipped due to token limit
        "true_positives": int(tp),
        "false_positives": int(fp),
        "false_negatives": int(fn),
        "precision": precision,  # Statistics: keep as float
        "recall": recall,  # Statistics: keep as float
        "f1": f1,  # Statistics: keep as float
    }

    if return_details:
        result["doc_details"] = doc_details

    return result

# Explanation:
# The file was updated to use a richer Pydantic schema for entities and relations,
# with explicit entity types and relation structures.
# The LLM prompt was enhanced to describe the schema and allowed relations more clearly,
# including relation descriptions loaded from rel_info.json.
# The extract_relations_llm function now returns structured entity/relation predictions,
# which are then normalized and converted to triples for evaluation.
# The evaluation function loads relation descriptions once and passes them to the extractor,
# preserving the original evaluation API and output format.