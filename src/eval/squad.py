# src/eval/squad.py

from typing import List, Dict, Any
import json
from pathlib import Path
import re
import string
from collections import Counter

from ..kg.extraction import extract_knowledge_graph
from ..llm import LLMClient

_llm = LLMClient()


def load_squad(path: str) -> List[Dict[str, Any]]:
    """Load a small SQuAD-style file (v1.1-ish)."""
    data = json.loads(Path(path).read_text())

    examples = []
    for article in data["data"]:
        for paragraph in article["paragraphs"]:
            context = paragraph["context"]
            for qa in paragraph["qas"]:
                question = qa["question"]
                answers = [a["text"] for a in qa["answers"]]
                examples.append(
                    {
                        "context": context,
                        "question": question,
                        "answers": answers,
                    }
                )
    return examples


def answer_with_kg(context: str, question: str) -> str:
    """KG-aware QA placeholder: extract KG then let LLM answer using triples."""
    kg = extract_knowledge_graph(context)

    triples_str = "\n".join(
        f"{t.subject} -[{t.predicate}]-> {t.object}" for t in kg.triples
    )

    prompt = f"""
        You are given:
        1. A question
        2. A set of knowledge graph triples extracted from some source text.
        You DO NOT have access to the original text.
        Use ONLY the triples to answer. If the triples are insufficient, say you cannot answer.

        Answer extremely concisely - just the answer, no explanation.
        
        Example:
        Question: "Which NFL team represented the AFC at Super Bowl 50?"
        Knowledge graph triples:
        Super Bowl 50 -[represented by]-> Denver Broncos
        Denver Broncos -[represents]-> AFC
        Answer: Denver Broncos
        
        Question: {question}

        Knowledge graph triples:
        {triples_str}

        Answer:
    """
    return _llm.get_completion(prompt=prompt, system_prompt="You are a precise QA assistant.", temperature=0.0)

def normalize_answer(s: str) -> str:
    """
    Lower text and remove punctuation, articles and extra whitespace.
    This follows the standard SQuAD normalization.
    """
    def remove_articles(text: str) -> str:
        return re.sub(r"\b(a|an|the)\b", " ", text)

    def white_space_fix(text: str) -> str:
        return " ".join(text.split())

    def remove_punc(text: str) -> str:
        return "".join(ch for ch in text if ch not in set(string.punctuation))

    def lower(text: str) -> str:
        return text.lower()

    return white_space_fix(remove_articles(remove_punc(lower(s))))


def f1_score(prediction: str, ground_truth: str) -> float:
    """
    Token-level F1 between prediction and ground truth after normalization.
    """
    pred_tokens = normalize_answer(prediction).split()
    gold_tokens = normalize_answer(ground_truth).split()

    if len(pred_tokens) == 0 and len(gold_tokens) == 0:
        return 1.0
    if len(pred_tokens) == 0 or len(gold_tokens) == 0:
        return 0.0

    common = Counter(pred_tokens) & Counter(gold_tokens)
    num_same = sum(common.values())

    if num_same == 0:
        return 0.0

    precision = num_same / len(pred_tokens)
    recall = num_same / len(gold_tokens)
    return 2 * precision * recall / (precision + recall)


def exact_match_score(prediction: str, ground_truth: str) -> bool:
    """
    Exact match after normalization.
    """
    return normalize_answer(prediction) == normalize_answer(ground_truth)


def metric_max_over_ground_truths(
    metric_fn, prediction: str, ground_truths: list[str]
) -> float | bool:
    """
    For a prediction and a list of gold answers, take the max metric over all golds.
    This is what SQuAD does.
    """
    scores = [metric_fn(prediction, gt) for gt in ground_truths]
    return max(scores) if scores else 0.0


def evaluate_squad(path: str | None = None, limit: int | None = None) -> Dict[str, Any]:
    """
    Run SQuAD-style evaluation for KG-based QA.

    Metrics:
      - exact_match: SQuAD EM (normalized, max over gold answers)
      - f1: SQuAD token F1 (normalized, max over gold answers)
    """
    if path is None:
        # Default to downloaded SQuAD dev set
        path = str(Path(__file__).parent.parent.parent / "data" / "eval" / "squad" / "european_union_law.json")

    examples = load_squad(path)
    if limit:
        examples = examples[:limit]

    num = len(examples)
    total_em = 0.0
    total_f1 = 0.0

    for ex in examples:
        pred = answer_with_kg(ex["context"], ex["question"]) or ""
        gold_answers = ex["answers"]

        em = metric_max_over_ground_truths(exact_match_score, pred, gold_answers)
        f1 = metric_max_over_ground_truths(f1_score, pred, gold_answers)

        # exact_match_score returns bool, so cast to float
        total_em += float(em)
        total_f1 += f1

    return {
        "num_examples": num,
        "exact_match": total_em / num if num else 0.0, # TODO: consider other metrics 
        "f1": total_f1 / num if num else 0.0,
    }