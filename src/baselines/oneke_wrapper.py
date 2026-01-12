"""
FastAPI wrapper for OneKE pipeline.

This runs INSIDE the OneKE Docker container and exposes an HTTP API
for relation extraction using OneKE's pipeline.
"""

import os
import sys

from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI

sys.path.append("/app/OneKE-src/src")
from pipeline import Pipeline


def _clear_proxy():
    """Clear proxy env vars that OneKE sets."""
    os.environ.pop("http_proxy", None)
    os.environ.pop("https_proxy", None)
    os.environ.pop("HTTP_PROXY", None)
    os.environ.pop("HTTPS_PROXY", None)


class OpenRouterLLM:
    """
    Minimal LLM adapter for OneKE Pipeline.

    Implements the interface OneKE expects:
    - name: str attribute
    - get_chat_response(prompt: str) -> str
    """

    def __init__(self, model: str, api_key: str):
        self.name = "ChatGPT"  # OneKE checks this for compatibility
        self.model = model
        _clear_proxy()  # Clear before creating client
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
        )

    def get_chat_response(self, prompt: str) -> str:
        """Generate response - the only method OneKE actually calls."""
        _clear_proxy()  # Clear before each request too
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=4096,
        )
        return response.choices[0].message.content


app = FastAPI(title="OneKE Wrapper")
pipelines = {}  # Cache pipelines by model


class ExtractRequest(BaseModel):
    text: str
    relations: list[str]
    model: str  # From ModelPicker (e.g., "openai/gpt-4o", "anthropic/claude-3-opus")
    api_key: str


class ExtractResponse(BaseModel):
    relation_list: list[dict]


@app.post("/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest):
    """Extract relations from text using OneKE pipeline."""
    # Get or create pipeline for this model
    if req.model not in pipelines:
        llm = OpenRouterLLM(model=req.model, api_key=req.api_key)
        pipelines[req.model] = Pipeline(llm)

    result, _, _, _ = pipelines[req.model].get_extract_result(
        task="RE",
        text=req.text,
        constraint=req.relations,
        mode="quick",
    )
    return result


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}
