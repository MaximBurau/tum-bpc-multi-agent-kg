# src/eval/redocred_re.py

from __future__ import annotations

from typing import List, Dict, Any, Tuple, Set
from pathlib import Path
import json
import string

from pydantic import BaseModel

from ..llm import LLMClient, Relation
import instructor

_llm = LLMClient()
# Patch instructor client to use JSON mode for List[Relation] support
_llm.instructor_client = instructor.patch(_llm.client, mode=instructor.Mode.JSON)


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


def build_gold_triples(doc: Dict[str, Any]) -> Set[Tuple[str, str, str]]:
    """
    Convert a Re-DocRED document into a set of gold triples:

      (normalized_subject_surface_text, relation_label, normalized_object_surface_text)

    Strategy:
      - Each entry in vertexSet is an entity cluster (coref).
      - We take the *first* mention in the cluster as the canonical form.
      - labels[i] gives: h (head idx), t (tail idx), r (relation id string).
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

        gold_triples.add((subj, r, obj))

    return gold_triples


def extract_relations_llm(
    text: str,
    relation_labels: List[str],
) -> List[Tuple[str, str, str]]:
    """
    Run a dedicated RE prompt on plain text using LLM structured output.

    Uses the RelationList schema from llm.py:
      relations: List[Relation] where
        - subject: surface form in the text
        - predicate: one of the allowed relation labels (strings from Re-DocRED)
        - object: surface form in the text
    """
    # Keep prompt deterministic + constrained
    allowed_relations_str = "\n".join(f"- {r}" for r in sorted(set(relation_labels)))

    system_prompt = (
        "You are an expert in document-level relation extraction.\n\n"
        "Task:\n"
        "- Read the given document.\n"
        "- Identify all factual relations between named entities.\n"
        "- Only use the relation labels from the allowed list.\n"
        "- Do NOT invent entities or relations that are not clearly stated.\n"
        "- Each relation should be a triple: (subject, predicate, object).\n"
        "- The subject and object must be exact contiguous spans from the text.\n"
        "- The predicate must be exactly one of the allowed relation labels.\n"
        "- Return each unique relation ONLY ONCE. Do NOT repeat relations.\n"
        "- Keep the output concise - extract only the most important relations.\n\n"
        "Allowed relation labels:\n"
        f"{allowed_relations_str}\n"
    )

    result: List[Relation] = _llm.get_structured_output(
        prompt=text,
        response_model=List[Relation],
        system_prompt=system_prompt,
        temperature=0.0,
        max_tokens=2000,  # Limit output to prevent repetition
    )

    triples: List[Tuple[str, str, str]] = []
    seen = set()  # Deduplicate
    for rel in result:
        if not rel.subject or not rel.object or not rel.predicate:
            continue
        subj = _normalize_text(rel.subject)
        obj = _normalize_text(rel.object)
        pred = rel.predicate.strip()
        if not subj or not obj or not pred:
            continue
        triple = (subj, pred, obj)
        if triple not in seen:
            seen.add(triple)
            triples.append(triple)

    return triples


def evaluate_redocred_re(
    path: str | None = None,
    limit: int | None = None,
) -> Dict[str, float]:
    """
    Evaluate relation extraction quality of a *standalone LLM-based RE* on Re-DocRED.

    Pipeline:
      1. Load Re-DocRED docs from JSON.
      2. For each doc, build:
           - plain-text document from 'sents'
           - gold triples from 'vertexSet' + 'labels'
      3. Build the global list of relation labels present in the dataset
         and feed them to the LLM as allowed predicates.
      4. Run extract_relations_llm(text) → predicted triples.
      5. Compare predicted vs gold triples as sets of
         (normalized_subject, relation_label, normalized_object).
         -> micro precision / recall / F1.
    """
    if path is None:    
        path = str(
            Path(__file__).parent.parent.parent / "data" / "eval" / "redocred" / "raw" / "dev_revised.json"
        )

    docs = load_redocred(path)
    if limit is not None:
        docs = docs[:limit]

    # Collect all relation labels present in the (sub-)dataset
    all_rel_labels = sorted(
        {lab["r"] for doc in docs for lab in doc.get("labels", [])}
    )

    tp = 0
    fp = 0
    fn = 0

    for doc in docs:
        # 1) Build gold triples
        gold_triples = build_gold_triples(doc)

        # 2) Reconstruct plain text
        sents = doc["sents"]
        text = " ".join(" ".join(sent) for sent in sents)

        # 3) LLM prediction
        pred_triples_list = extract_relations_llm(text, all_rel_labels)
        pred_triples = set(pred_triples_list)

        # 4) Set-based counts
        tp += len(pred_triples & gold_triples)
        fp += len(pred_triples - gold_triples)
        fn += len(gold_triples - pred_triples)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return {
        "num_docs": float(len(docs)),
        "true_positives": float(tp),
        "false_positives": float(fp),
        "false_negatives": float(fn),
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }