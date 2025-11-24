# src/eval/conll2003_ner.py

from __future__ import annotations

from typing import List, Dict, Any, Tuple
from pathlib import Path
from collections import Counter
import string

from pydantic import BaseModel

from ..llm import LLMClient, Entity
import instructor

_llm = LLMClient()
# Patch instructor client to use JSON mode for List[Entity] support
_llm.instructor_client = instructor.patch(_llm.client, mode=instructor.Mode.JSON)


def load_conll2003(path: str) -> List[Dict[str, Any]]:
    """
    Load CoNLL-2003-style file (eng.testa / eng.testb / eng.train).

    Format per non-empty line:
        token POS CHUNK NER
    Sentences separated by blank lines.
    Lines starting with -DOCSTART- are skipped.
    """
    examples: List[Dict[str, Any]] = []
    tokens: List[str] = []
    labels: List[str] = []

    with open(path, "r", encoding="utf8") as f:
        for line in f:
            line = line.rstrip("\n")

            if not line:
                if tokens:
                    examples.append({"tokens": tokens, "labels": labels})
                    tokens, labels = [], []
                continue

            if line.startswith("-DOCSTART-"):
                continue

            parts = line.split()
            if len(parts) < 4:
                # malformed line, skip gracefully
                continue

            token = parts[0]
            ner_tag = parts[-1]  # NER tag is the last column

            tokens.append(token)
            labels.append(ner_tag)

    if tokens:
        examples.append({"tokens": tokens, "labels": labels})

    return examples


def _normalize_text(text: str) -> str:
    """
    Simple normalization: lowercase, strip punctuation at ends, collapse spaces.
    Only used for matching predicted vs gold entity strings.
    """
    text = text.lower().strip()
    # strip leading/trailing punctuation
    text = text.strip(string.punctuation)
    # collapse internal whitespace
    text = " ".join(text.split())
    return text


def bio_to_entity_spans(
    tokens: List[str], labels: List[str]
) -> List[Tuple[str, str]]:
    """
    Convert BIO tags into (entity_text, entity_type) spans.

    Only B-XXX / I-XXX are considered entities; O is non-entity.
    Returns a list of (normalized_text, type) pairs.
    """
    spans: List[Tuple[str, str]] = []
    current_tokens: List[str] = []
    current_type: str | None = None

    def flush():
        nonlocal current_tokens, current_type
        if current_tokens and current_type is not None:
            text = " ".join(current_tokens)
            spans.append((_normalize_text(text), current_type))
        current_tokens = []
        current_type = None

    for tok, tag in zip(tokens, labels):
        if tag == "O":
            flush()
            continue

        if tag.startswith("B-"):
            flush()
            current_type = tag.split("-", 1)[1]
            current_tokens = [tok]
        elif tag.startswith("I-"):
            ent_type = tag.split("-", 1)[1]
            if current_tokens and current_type == ent_type:
                current_tokens.append(tok)
            else:
                # broken I-tag, treat as new B
                flush()
                current_type = ent_type
                current_tokens = [tok]
        else:
            # unknown tag, flush
            flush()

    flush()
    return spans


def extract_ner_llm(text: str) -> List[Tuple[str, str]]:
    """
    Run a dedicated NER prompt on plain text using LLM structured output.

    Uses the EntityList schema from llm.py:
      entities: List[Entity] where
        - Entity.name is surface span
        - Entity.type is one of {PER, ORG, LOC, MISC} or a compatible label
    """
    system_prompt = (
        "Your job is to extract named entities from the given sentence.\n\n"
        "Rules:\n"
        "- Only recognize entities of types: PER, ORG, LOC, MISC.\n"
        "- Use 'PER' for persons, 'ORG' for organizations, 'LOC' for locations, "
        "and 'MISC' for other named entities.\n"
        "- Each entity should be a contiguous span of tokens as they appear in the text.\n"
        "- Do NOT hallucinate entities not present in the text.\n"
        "- Return your answer as an EntityList, where each Entity has:\n"
        "    - name: the exact surface string of the entity\n"
        "    - type: one of PER, ORG, LOC, MISC\n"
    )

    # We just send the raw sentence as the user prompt
    result: List[Entity] = _llm.get_structured_output(
        prompt=text,
        response_model=List[Entity],
        system_prompt=system_prompt,
        temperature=0.0,
    )

    spans: List[Tuple[str, str]] = []
    for ent in result:
        if not ent.name or not ent.type:
            continue
        spans.append((_normalize_text(ent.name), ent.type))

    return spans


def evaluate_conll2003_ner(
    path: str | None = None,
    limit: int | None = None,
) -> Dict[str, float]:
    """
    Evaluate NER quality of a *standalone LLM-based NER* on CoNLL-2003.

    Pipeline:
      1. Read CoNLL-2003 sentences and BIO labels.
      2. Convert BIO to gold spans (normalized_text, type).
      3. Run `extract_ner_llm` on the sentence text.
      4. Compare predicted spans vs gold spans as sets of (text, type).
         -> micro precision / recall / F1 across the dataset.
    """
    if path is None:
        # default to validation set in data/eval/conll2003/raw/validation.txt
        path = str(
            Path(__file__).parent.parent.parent / "data" / "eval" / "conll2003" / "raw" / "validation.txt"
        )

    examples = load_conll2003(path)
    if limit:
        examples = examples[:limit]

    tp = 0
    fp = 0
    fn = 0

    for ex in examples:
        tokens = ex["tokens"]
        labels = ex["labels"]

        gold_spans = set(bio_to_entity_spans(tokens, labels))

        sentence = " ".join(tokens)
        pred_spans = set(extract_ner_llm(sentence))

        tp += len(pred_spans & gold_spans)
        fp += len(pred_spans - gold_spans)
        fn += len(gold_spans - pred_spans)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return {
        "num_sentences": float(len(examples)),
        "true_positives": float(tp),
        "false_positives": float(fp),
        "false_negatives": float(fn),
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }