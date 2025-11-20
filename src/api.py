"""
FastAPI backend for multi-agent knowledge graph dashboard.

Provides REST API endpoints for LLM operations, Neo4j queries, and agent management.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from llm import LLMClient
from config import config
import os

app = FastAPI(title="Multi-Agent KG API")

# CORS middleware for Next.js dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize LLM client
llm_client = LLMClient()


# Request/Response Models

class LLMTestRequest(BaseModel):
    prompt: str
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    schema: Optional[str] = None
    temperature: Optional[float] = 0.7


class LLMTestResponse(BaseModel):
    output: Any
    model_used: str
    is_structured: bool


# LLM Endpoints

@app.post("/api/llm/test", response_model=LLMTestResponse)
async def test_llm(request: LLMTestRequest):
    """
    Test LLM with a prompt.
    Supports both structured (with schema) and unstructured outputs.
    """
    try:
        model = request.model or "openai/gpt-4o"
        
        # Structured output if schema is specified
        if request.schema and request.schema != "None":
            # Import the schema from llm.py
            from llm import Entity, Relation, EntityList, RelationList, KnowledgeGraphExtraction
            
            schema_map = {
                "Entity": Entity,
                "Relation": Relation,
                "EntityList": EntityList,
                "RelationList": RelationList,
                "KnowledgeGraphExtraction": KnowledgeGraphExtraction,
            }
            
            if request.schema not in schema_map:
                raise HTTPException(status_code=400, detail=f"Unknown schema: {request.schema}")
            
            response_model = schema_map[request.schema]
            result = llm_client.get_structured_output(
                prompt=request.prompt,
                response_model=response_model,
                system_prompt=request.system_prompt,
                model=model,
                temperature=request.temperature
            )
            
            return LLMTestResponse(
                output=result.model_dump(),
                model_used=model,
                is_structured=True
            )
        else:
            # Unstructured text output
            result = llm_client.get_completion(
                prompt=request.prompt,
                system_prompt=request.system_prompt,
                model=model,
                temperature=request.temperature
            )
            
            return LLMTestResponse(
                output=result,
                model_used=model,
                is_structured=False
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Neo4j Endpoints

@app.get("/api/kg")
async def get_knowledge_graph():
    """
    Get knowledge graph data from Neo4j.
    Returns nodes and edges for visualization.
    """
    try:
        from neo4j_client import neo4j_client
        data = neo4j_client.get_graph_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Agent Endpoints

@app.get("/api/agents")
async def get_agents():
    """List all available agents."""
    return {
        "agents": [
            {"name": "Parser", "status": "inactive"},
            {"name": "Entity Extractor", "status": "inactive"},
            {"name": "Relation Extractor", "status": "inactive"},
            {"name": "Linker", "status": "inactive"},
            {"name": "Evaluator", "status": "inactive"},
            {"name": "Example Generator", "status": "inactive"},
        ]
    }


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

