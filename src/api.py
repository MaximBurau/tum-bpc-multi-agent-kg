"""
FastAPI backend for multi-agent knowledge graph dashboard.

Provides REST API endpoints for LLM operations, Neo4j queries, and agent management.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from src.llm import LLMClient
from src.config import config
from src.kg.extraction import extract_knowledge_graph as kg_extract, extract_triples as kg_extract_triples, extract_entities as kg_extract_entities
from src.neo4j_client import Neo4jClient
from src.db import run_db
import time

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
            from src.llm import Entity, Relation, EntityList, RelationList, KnowledgeGraphExtraction
            
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


# Knowledge Graph Endpoints

class ExtractionRequest(BaseModel):
    text: str

class ExtractionResponse(BaseModel):
    entities: list[dict]
    triples: list[dict]

@app.post("/api/kg/extract", response_model=ExtractionResponse)
async def extract_kg_endpoint(request: ExtractionRequest):
    """
    Extract knowledge graph from text and write to Neo4j.
    """
    kg = kg_extract(request.text)
    
    # Write triples to Neo4j
    try:
        from src.neo4j_client import neo4j_client
        triples_to_write = [(t.subject, t.predicate, t.object) for t in kg.triples]
        if triples_to_write:
            neo4j_client.write_triples(triples_to_write)
    except Exception as e:
        print(f"Warning: Failed to write to Neo4j: {e}")
    
    return ExtractionResponse(
        entities=[entity.model_dump() for entity in kg.entities],
        triples=[triple.model_dump() for triple in kg.triples]
    )

@app.post("/api/kg/extract/triples", response_model=ExtractionResponse)
async def extract_triples_endpoint(request: ExtractionRequest):
    """
    Extract triples from text.
    """
    triples = kg_extract_triples(request.text)
    return ExtractionResponse(
        triples=[{"subject": t[0], "predicate": t[1], "object": t[2]} for t in triples]
    )

@app.post("/api/kg/extract/entities", response_model=ExtractionResponse)
async def extract_entities_endpoint(request: ExtractionRequest):
    """
    Extract entities from text.
    """
    entities = kg_extract_entities(request.text)
    return ExtractionResponse(
        entities=[entity.model_dump() for entity in entities]
    )

# Neo4j Endpoints

@app.get("/api/kg/graph")
async def get_knowledge_graph():
    """
    Get knowledge graph data from Neo4j.
    Returns nodes and edges for visualization.
    """
    try:
        from src.neo4j_client import neo4j_client
        data = neo4j_client.get_graph_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))






# Pipeline Runner Endpoints

class PipelineRunRequest(BaseModel):
    task_type: str  # "qa" or "ner"
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    limit: Optional[int] = None
    tags: Optional[List[str]] = None

class PipelineRunResponse(BaseModel):
    run_id: int
    task_type: str
    metrics: Dict[str, Any]
    duration_seconds: float
    num_examples: int
    outputs: Optional[Dict[str, Any]] = None

@app.post("/api/pipeline/run", response_model=PipelineRunResponse)
async def run_pipeline(request: PipelineRunRequest):
    """
    Execute a pipeline run (Q&A or NER evaluation).
    Stores results in SQLite and returns metrics.
    """
    try:
        start_time = time.time()
        outputs = None
        
        if request.task_type == "qa":
            from src.eval.squad import evaluate_squad
            metrics = evaluate_squad(limit=request.limit)
            num_examples = metrics.get("num_examples", 0)
        elif request.task_type == "ner":
            from src.eval.conll2003_ner import evaluate_conll2003_ner
            metrics = evaluate_conll2003_ner(limit=request.limit)
            num_examples = metrics.get("num_examples", 0)
        elif request.task_type == "redocred":
            from src.eval.redocred import evaluate_redocred_re
            result = evaluate_redocred_re(limit=request.limit, return_details=True)
            # Separate metrics from detailed outputs
            metrics = {k: v for k, v in result.items() if k != "doc_details"}
            num_examples = metrics.get("num_docs", 0)
            # Store detailed outputs separately
            outputs = {"doc_details": result.get("doc_details", [])}
        else:
            raise HTTPException(status_code=400, detail=f"Unknown task type: {request.task_type}")
        
        duration = time.time() - start_time
        
        # Store run in database
        run_id = run_db.insert_run(
            task_type=request.task_type,
            metrics=metrics,
            prompt=request.prompt,
            system_prompt=request.system_prompt,
            model=request.model,
            duration_seconds=duration,
            num_examples=num_examples,
            tags=request.tags,
            outputs=outputs,
        )
        
        return PipelineRunResponse(
            run_id=run_id,
            task_type=request.task_type,
            metrics=metrics,
            duration_seconds=duration,
            num_examples=num_examples,
            outputs=outputs,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Run History Endpoints

@app.get("/api/runs")
async def get_runs(task_type: Optional[str] = None, limit: int = 100, offset: int = 0):
    """
    Get list of pipeline runs with optional filtering.
    """
    try:
        runs = run_db.get_runs(task_type=task_type, limit=limit, offset=offset)
        return {"runs": runs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/runs/{run_id}")
async def get_run(run_id: int):
    """
    Get details of a specific run by ID.
    """
    try:
        run = run_db.get_run_by_id(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return run
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: int):
    """
    Delete a run by ID.
    """
    try:
        deleted = run_db.delete_run(run_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Run not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateTagsRequest(BaseModel):
    tags: List[str]

@app.patch("/api/runs/{run_id}/tags")
async def update_run_tags(run_id: int, request: UpdateTagsRequest):
    """
    Update tags for a run.
    """
    try:
        updated = run_db.update_tags(run_id, request.tags)
        if not updated:
            raise HTTPException(status_code=404, detail="Run not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
async def get_run_stats():
    """
    Get aggregate statistics across all runs.
    """
    try:
        stats = run_db.get_stats()
        return stats
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
