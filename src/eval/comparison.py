# src/eval/comparison.py
"""
Baseline comparison evaluation.

Orchestrates running multiple systems on the same documents
and comparing their F1 scores side-by-side.
"""

from typing import Dict, Any, List, Set, Tuple
from pathlib import Path

from .redocred import (
    load_redocred,
    load_rel_info,
    build_gold_triples,
    evaluate_redocred_re,
    _normalize_text,
)
from ..baselines.oneke_client import OneKEClient


async def evaluate_oneke(
    docs: List[Dict],
    rel_info: Dict[str, str],
    model: str,
    return_details: bool = False,
) -> Dict[str, Any]:
    """
    Evaluate OneKE on given documents.

    Args:
        docs: ReDocRED documents
        rel_info: Relation ID to name mapping
        model: Model to use (e.g., "openai/gpt-4o-mini")
        return_details: If True, return per-document details

    Returns:
        Metrics dict with precision, recall, f1, etc.
    """
    # Get all relation names for OneKE
    all_rel_ids = sorted({lab["r"] for doc in docs for lab in doc.get("labels", [])})
    all_rel_names = [rel_info.get(r, r) for r in all_rel_ids]

    # Initialize OneKE client
    oneke = OneKEClient(model=model)
    if not oneke.health_check():
        raise RuntimeError(
            "OneKE container is not running. Start with: "
            "docker build -t oneke-wrapper -f docker/oneke/Dockerfile . && "
            "docker run -d -p 9000:9000 oneke-wrapper"
        )

    tp = 0
    fp = 0
    fn = 0
    details = [] if return_details else None

    for doc_idx, doc in enumerate(docs):
        gold_triples = build_gold_triples(doc, rel_info=rel_info)

        # Reconstruct plain text
        text = " ".join(" ".join(sent) for sent in doc["sents"])

        try:
            pred_triples_list = oneke.extract(
                text=text,
                relations=all_rel_names,
                model=model,
            )
            pred_triples = set(
                (_normalize_text(s), r, _normalize_text(o))
                for s, r, o in pred_triples_list
            )
            error = None
        except Exception as e:
            print(f"OneKE error on doc {doc_idx}: {e}")
            pred_triples = set()
            error = str(e)

        doc_tp = len(pred_triples & gold_triples)
        doc_fp = len(pred_triples - gold_triples)
        doc_fn = len(gold_triples - pred_triples)

        tp += doc_tp
        fp += doc_fp
        fn += doc_fn

        if return_details:
            details.append({
                "doc_index": doc_idx,
                "text": text,
                "predicted_triples": [list(t) for t in pred_triples],
                "gold_triples": [list(t) for t in gold_triples],
                "true_positives": doc_tp,
                "false_positives": doc_fp,
                "false_negatives": doc_fn,
                "error": error,
            })

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    result = {
        "num_docs": len(docs),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }

    if return_details:
        result["doc_details"] = details

    return result


async def compare_with_baseline(
    flow_id: int,
    model: str,
    limit: int = 10,
    return_details: bool = False,
) -> Dict[str, Any]:
    """
    Compare your system against OneKE baseline on the same documents.

    Args:
        flow_id: Flow ID for your system
        model: Model to use for both systems
        limit: Number of documents to evaluate
        return_details: If True, return per-document details

    Returns:
        {
            "your_system": {...metrics...},
            "oneke": {...metrics...},
            "comparison": {
                "f1_delta": your_f1 - oneke_f1,
                "winner": "your_system" | "oneke" | "tie"
            },
            "model": model,
            "num_docs": N
        }
    """
    # Load documents
    path = str(
        Path(__file__).parent.parent.parent
        / "data" / "eval" / "redocred" / "raw" / "dev_revised.json"
    )
    docs = load_redocred(path)
    if limit is not None:
        docs = docs[:limit]

    rel_info = load_rel_info()

    # Run your system
    your_result = await evaluate_redocred_re(
        path=path,
        limit=limit,
        return_details=return_details,
        flow_id=flow_id,
    )

    # Run OneKE on same docs
    oneke_result = await evaluate_oneke(
        docs=docs,
        rel_info=rel_info,
        model=model,
        return_details=return_details,
    )

    # Compare
    your_f1 = your_result.get("f1", 0.0)
    oneke_f1 = oneke_result.get("f1", 0.0)

    if your_f1 > oneke_f1:
        winner = "your_system"
    elif oneke_f1 > your_f1:
        winner = "oneke"
    else:
        winner = "tie"

    return {
        "your_system": your_result,
        "oneke": oneke_result,
        "comparison": {
            "f1_delta": your_f1 - oneke_f1,
            "your_f1": your_f1,
            "oneke_f1": oneke_f1,
            "winner": winner,
        },
        "model": model,
        "num_docs": len(docs),
    }
