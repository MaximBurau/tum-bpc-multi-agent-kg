"""
Client for calling OneKE Docker container.

This runs in your main application and calls the OneKE wrapper API.
"""

import requests
from typing import List, Tuple

from src.config import config


class OneKEClient:
    """Client for OneKE baseline extraction via Docker container."""

    def __init__(
        self,
        base_url: str = "http://localhost:9000",
        api_key: str = None,
        model: str = None,
    ):
        self.base_url = base_url
        self.api_key = api_key or config.openrouter_api_key
        self.model = model

    def extract(
        self,
        text: str,
        relations: List[str],
        model: str = None,
    ) -> List[Tuple[str, str, str]]:
        """
        Extract relations from text using OneKE.

        Args:
            text: Document text
            relations: List of relation types to extract
            model: Model to use (overrides instance default)

        Returns:
            List of (subject, relation, object) triples
        """
        model_to_use = model or self.model
        if not model_to_use:
            raise ValueError("Model must be specified")

        resp = requests.post(
            f"{self.base_url}/extract",
            json={
                "text": text,
                "relations": relations,
                "model": model_to_use,
                "api_key": self.api_key,
            },
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        # Convert to (subject, relation, object) triples
        triples = []
        for r in data.get("relation_list", []):
            subj = r.get("head", "")
            rel = r.get("relation", "")
            obj = r.get("tail", "")
            triples.append((subj, rel, obj))

        return triples

    def health_check(self) -> bool:
        """Check if OneKE container is running."""
        try:
            resp = requests.get(f"{self.base_url}/health", timeout=5)
            return resp.status_code == 200
        except requests.RequestException:
            return False
