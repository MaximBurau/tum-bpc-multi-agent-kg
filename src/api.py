"""
FastAPI backend for multi-agent knowledge graph dashboard.

Provides REST API endpoints for:
- Dynamic agent management (types, versions)
- Flow definition and execution
- LLM operations
- Neo4j queries
- Run history
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from src.llm import LLMClient
from src.config import config
from src.kg.extraction import extract_knowledge_graph as kg_extract, extract_triples as kg_extract_triples, extract_entities as kg_extract_entities
from src.neo4j_client import Neo4jClient
from src.db import run_db, init_db
import time

# Initialize database on startup
init_db()

app = FastAPI(title="Multi-Agent KG API")

# Exception handler for Pydantic validation errors
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors with detailed messages."""
    errors = []
    for error in exc.errors():
        field_path = " -> ".join(str(loc) for loc in error["loc"])
        errors.append({
            "field": field_path,
            "message": error["msg"],
            "type": error["type"],
            "input": error.get("input")
        })
    
    print(f"\n{'='*80}")
    print(f"Request validation error on {request.method} {request.url}")
    print(f"Errors: {errors}")
    print(f"{'='*80}\n")
    
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=400,
        content={
            "error": "Request validation failed",
            "message": "The request body does not match the expected format",
            "errors": errors,
            "hint": "Check that all required fields are provided and have the correct types"
        }
    )

# CORS middleware for Next.js dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
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
    system_prompt: Optional[str] = None

class ExtractionResponse(BaseModel):
    entities: list[dict]
    triples: list[dict]
    raw_llm_output: Optional[dict] = None

@app.post("/api/kg/extract", response_model=ExtractionResponse)
async def extract_kg_endpoint(request: ExtractionRequest):
    """
    Extract knowledge graph from text and write to Neo4j.
    """
    # Treat empty string as None to use default prompt
    system_prompt = request.system_prompt if request.system_prompt and request.system_prompt.strip() else None
    kg, raw_output = kg_extract(request.text, system_prompt=system_prompt, return_raw=True)
    
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
        triples=[triple.model_dump() for triple in kg.triples],
        raw_llm_output=raw_output
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
    task_type: str  # "qa" or "ner" or "intrinsic_eval"
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    limit: Optional[int] = None
    tags: Optional[List[str]] = None
    flow_id: Optional[int] = None  # For intrinsic_eval: use flow instead of agent

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
        elif request.task_type == "intrinsic_eval":
            from src.eval.redocred import evaluate_redocred_re
            result = await evaluate_redocred_re(
                limit=request.limit,
                return_details=True,
                flow_id=request.flow_id
            )
            # Separate metrics from detailed outputs
            metrics = {k: v for k, v in result.items() if k != "doc_details"}
            num_examples = request.limit if request.limit else metrics.get("num_docs", 0)
            # Store detailed outputs separately
            outputs = {"doc_details": result.get("doc_details", [])}
        else:
            raise HTTPException(status_code=400, detail=f"Unknown task type: {request.task_type}")
        
        duration = time.time() - start_time
        
        # Determine model field: if flow_id is provided, use flow name instead of model
        model_to_store = request.model
        if request.task_type == "intrinsic_eval" and request.flow_id:
            # Fetch flow name to display in model column
            from src.db import get_session
            from src.models import Flow
            import asyncio
            
            def _get_flow_name():
                sess = get_session()
                try:
                    flow = sess.query(Flow).filter_by(id=request.flow_id).first()
                    return flow.name if flow else None
                finally:
                    sess.close()
            
            flow_name = await asyncio.to_thread(_get_flow_name)
            if flow_name:
                model_to_store = flow_name
        
        # Store run in database (non-blocking)
        import asyncio
        run_id = await asyncio.to_thread(
            run_db.insert_run,
            task_type=request.task_type,
            metrics=metrics,
            prompt=request.prompt,
            system_prompt=request.system_prompt,
            model=model_to_store,
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


# ============================================================================
# Agent Registry Endpoints
# ============================================================================

@app.get("/api/agents")
async def get_agents():
    """List all available agents (legacy endpoint for backwards compat)."""
    from src.agents.registry import get_agent_registry
    try:
        registry = get_agent_registry()
        # Convert to legacy format
        agents = []
        for agent in registry:
            agents.append({
                "name": agent["name"],
                "status": "active" if agent["versions"] else "inactive",
                "versions": len(agent["versions"]),
                "latest_version": agent["versions"][0]["version"] if agent["versions"] else None
            })
        return {"agents": agents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/registry")
async def get_agent_registry_endpoint():
    """Get full agent registry with all types and versions."""
    from src.agents.registry import get_agent_registry
    try:
        registry = get_agent_registry()
        return {"agents": registry}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AgentTypeRenameRequest(BaseModel):
    new_name: str


@app.put("/api/agents/{agent_name}/rename")
async def rename_agent_type_endpoint(agent_name: str, request: AgentTypeRenameRequest):
    """Rename an agent type."""
    from src.agents.registry import update_agent_type_name, get_agent_type
    
    try:
        # Check if agent exists
        existing = get_agent_type(agent_name)
        if not existing:
            raise HTTPException(
                status_code=404,
                detail=f"Agent type not found: {agent_name}"
            )
        
        # Validate new name
        if not request.new_name or not request.new_name.strip():
            raise HTTPException(
                status_code=400,
                detail="New name cannot be empty"
            )
        
        # Rename the agent
        try:
            updated = update_agent_type_name(agent_name, request.new_name.strip())
            if not updated:
                raise HTTPException(
                    status_code=404,
                    detail=f"Agent type not found: {agent_name}"
                )
            
            return {
                "id": updated.id,
                "old_name": agent_name,
                "new_name": updated.name,
                "python_class": updated.python_class
            }
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=str(e)
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/{agent_name}/versions")
async def get_agent_versions_endpoint(agent_name: str):
    """Get all versions of a specific agent type."""
    from src.agents.registry import get_agent_versions, get_agent_type
    try:
        agent_type = get_agent_type(agent_name)
        if not agent_type:
            raise HTTPException(status_code=404, detail=f"Agent type not found: {agent_name}")
        
        versions = get_agent_versions(agent_name)
        return {
            "agent_type": agent_name,
            "versions": [
                {
                    "id": v.id,
                    "version": v.version_number,
                    "prompt": v.prompt,
                    "schema_json": v.schema_json,
                    "model_name": v.model_name,
                    "created_at": v.created_at.isoformat() if v.created_at else None
                }
                for v in versions
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Cache for OpenRouter models
_models_cache = {"models": [], "fetched_at": None}
CACHE_TTL_SECONDS = 3600  # 1 hour


def _fetch_models_sync():
    """Sync function to fetch models from OpenRouter."""
    import requests
    from datetime import datetime, timedelta

    # Return cached if still valid
    if _models_cache["fetched_at"] and \
       datetime.now() - _models_cache["fetched_at"] < timedelta(seconds=CACHE_TTL_SECONDS):
        return _models_cache["models"]

    try:
        response = requests.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {config.openrouter_api_key}"}
        )
        response.raise_for_status()
        data = response.json()

        models = []
        for model in data.get("data", []):
            model_id = model.get("id", "")
            name = model.get("name", model_id)
            # Extract provider from model id (e.g., "openai/gpt-4o" -> "openai")
            provider = model_id.split("/")[0] if "/" in model_id else "unknown"

            models.append({
                "id": model_id,
                "name": name,
                "provider": provider,
            })

        # Sort by provider then name
        models.sort(key=lambda m: (m["provider"].lower(), m["name"].lower()))

        _models_cache["models"] = models
        _models_cache["fetched_at"] = datetime.now()

        return models
    except Exception as e:
        print(f"Error fetching OpenRouter models: {e}")
        # Return cached models if available, otherwise empty list
        return _models_cache["models"] if _models_cache["models"] else []


async def fetch_openrouter_models():
    """Fetch all available models from OpenRouter API."""
    import asyncio
    return await asyncio.to_thread(_fetch_models_sync)


class AgentTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None


@app.get("/api/models")
async def get_available_models():
    """Get list of available LLM models from OpenRouter."""
    models = await fetch_openrouter_models()
    return {"models": models}


class SchemaSuggestionRequest(BaseModel):
    agent_name: str
    prompt: str
    description: Optional[str] = None


@app.post("/api/suggest-schema")
async def suggest_schema_endpoint(request: SchemaSuggestionRequest):
    """
    Use LLM to auto-generate a schema suggestion based on agent name and prompt.
    Makes schema creation way less painful.
    """
    from langchain_openai import ChatOpenAI
    from pydantic import BaseModel as PydanticBaseModel, Field
    from typing import List, Literal
    import json
    
    try:
        llm = ChatOpenAI(
            model="openai/gpt-4o-mini",
            base_url="https://openrouter.ai/api/v1",
            api_key=config.openrouter_api_key,
            temperature=0.0
        )
        
        system_prompt = """You are an expert at designing output schemas for LLM agents related to knowledge graph construction.
Given an agent's name, prompt template, and optional description, suggest a clean output schema.

Return a JSON object with:
- "fields": array of field definitions
- "reasoning": brief explanation of the schema design

Each field in "fields" should have:
- "name": field name in snake_case
- "type": one of "str", "int", "float", "bool", or for lists use {"type": "list", "items": ...}

For lists of objects, use:
{"type": "list", "items": {"type": "object", "fields": [{"name": "...", "type": "str"}, ...]}}

Common patterns:
- Entity extraction: entities as list of objects with name + entity_type
- Relation extraction: relations as list of objects with head + relation + tail
- Classification: label (str), confidence (float)
- QA: answer (str), evidence (str)

Return ONLY valid JSON, no markdown."""
        
        user_prompt = f"""Agent name: {request.agent_name}

Prompt template:
{request.prompt}

{f"Description: {request.description}" if request.description else ""}

Return a JSON schema suggestion."""

        response = await llm.ainvoke([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ])
        
        # Parse the JSON response
        content = response.content.strip()
        # Remove markdown code blocks if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()
        
        result = json.loads(content)
        
        return {
            "schema": result.get("fields", []),
            "reasoning": result.get("reasoning", "Schema suggested based on prompt analysis.")
        }
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse schema suggestion: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema suggestion failed: {str(e)}")


@app.post("/api/agents")
async def create_agent_type_endpoint(request: AgentTypeCreate):
    """Create a new agent type."""
    from src.agents.registry import create_agent_type, get_agent_type
    try:
        # Check if already exists
        existing = get_agent_type(request.name)
        if existing:
            raise HTTPException(status_code=400, detail=f"Agent type already exists: {request.name}")
        
        # Use KGAgent as the base class for all new agent types
        python_class = "src.agents.kg_agent.KGAgent"
        
        agent_type = create_agent_type(
            name=request.name,
            python_class=python_class
        )
        return {
            "id": agent_type.id,
            "name": agent_type.name,
            "python_class": agent_type.python_class
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AgentVersionCreate(BaseModel):
    prompt: str
    schema_json: List[Dict[str, Any]]
    model_name: str


@app.post("/api/agents/{agent_name}/versions")
async def create_agent_version_endpoint(agent_name: str, request: AgentVersionCreate):
    """Create a new version for an agent type."""
    from src.agents.registry import create_agent_version, get_agent_type
    try:
        agent_type = get_agent_type(agent_name)
        if not agent_type:
            raise HTTPException(status_code=404, detail=f"Agent type not found: {agent_name}")
        
        version = create_agent_version(
            agent_type_name=agent_name,
            prompt=request.prompt,
            schema_json=request.schema_json,
            model_name=request.model_name,
        )
        return {
            "id": version.id,
            "version": version.version_number,
            "agent_type": agent_name,
            "created_at": version.created_at.isoformat() if version.created_at else None
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class AgentVersionUpdate(BaseModel):
    prompt: Optional[str] = None
    schema_json: Optional[List[Dict[str, Any]]] = None
    model_name: Optional[str] = None


@app.put("/api/agents/{agent_name}/versions/{version_num}")
async def update_agent_version_endpoint(agent_name: str, version_num: int, request: AgentVersionUpdate):
    """Update an existing agent version."""
    from src.agents.registry import update_agent_version, get_agent_version
    try:
        # Check version exists
        existing = get_agent_version(agent_name, version_num)
        if not existing:
            raise HTTPException(status_code=404, detail=f"Agent version not found: {agent_name}@{version_num}")
        
        version = update_agent_version(
            agent_type_name=agent_name,
            version_number=version_num,
            prompt=request.prompt,
            schema_json=request.schema_json,
            model_name=request.model_name
        )
        return {
            "id": version.id,
            "version": version.version_number,
            "agent_type": agent_name,
            "prompt": version.prompt,
            "schema_json": version.schema_json,
            "model_name": version.model_name,
            "updated": True
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AgentTestRequest(BaseModel):
    version: Optional[int] = None
    input_text: str


@app.post("/api/agents/{agent_name}/test")
async def test_agent_endpoint(agent_name: str, request: AgentTestRequest):
    """Test an agent on sample input."""
    from src.agents.loader import load_agent
    from src.db import get_session
    
    try:
        session = get_session()
        model_cache = {}
        
        # Build agent reference
        if request.version:
            agent_ref = f"{agent_name}@{request.version}"
        else:
            agent_ref = agent_name
        
        agent = load_agent(session, agent_ref, model_cache)
        runnable = agent.build_runnable()
        
        # Build inputs - provide defaults for common placeholders
        inputs = {
            "text": request.input_text,
            "entities": "[]",  # Default empty for relation extractor
        }
        
        # Run the agent
        result = await runnable.ainvoke(inputs)
        
        session.close()
        
        # Serialize output
        output = result.get("output")
        if hasattr(output, "model_dump"):
            output = output.model_dump()
        
        return {
            "agent": agent_ref,
            "output": output,
            "trace": result.get("_trace", {})
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        # Enhanced error reporting for debugging
        import traceback
        error_type = type(e).__name__
        error_msg = str(e)
        full_traceback = traceback.format_exc()
        
        # Log to console for server-side debugging
        print(f"\n{'='*80}")
        print(f"ERROR in test_agent_endpoint for agent: {agent_name}")
        print(f"Error Type: {error_type}")
        print(f"Error Message: {error_msg}")
        print(f"\nFull Traceback:")
        print(full_traceback)
        print(f"{'='*80}\n")
        
        # Return detailed error to client
        raise HTTPException(
            status_code=500,
            detail={
                "error": error_msg,
                "error_type": error_type,
                "agent": agent_name,
                "model": getattr(agent, 'model_name', 'unknown') if 'agent' in locals() else 'unknown'
            }
        )


# ============================================================================
# Flow Endpoints
# ============================================================================

@app.get("/api/flows")
async def get_flows_endpoint():
    """Get all flows."""
    from src.flow.registry import get_flows_list
    try:
        flows = get_flows_list()
        return {"flows": flows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FlowCreate(BaseModel):
    name: str
    yaml_definition: str


@app.post("/api/flows")
async def create_flow_endpoint(request: FlowCreate):
    """Create a new flow."""
    from src.flow.registry import create_flow
    from src.flow.compiler import validate_flow
    from src.db import get_session
    import traceback
    import yaml
    
    try:
        # Validate request fields
        if not request.name or not request.name.strip():
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Flow name is required",
                    "field": "name",
                    "received": request.name
                }
            )
        
        if not request.yaml_definition or not request.yaml_definition.strip():
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "YAML definition is required",
                    "field": "yaml_definition",
                    "received": "empty or whitespace only"
                }
            )
        
        # Try to parse YAML first
        try:
            yaml_data = yaml.safe_load(request.yaml_definition)
            if yaml_data is None:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "YAML is empty or invalid",
                        "field": "yaml_definition",
                        "hint": "YAML must contain at least a 'version' and 'steps' field"
                    }
                )
        except yaml.YAMLError as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Invalid YAML syntax",
                    "field": "yaml_definition",
                    "yaml_error": str(e),
                    "hint": "Check your YAML syntax (indentation, colons, dashes, etc.)"
                }
            )
        
        # Validate the flow structure
        session = get_session()
        try:
            validation = validate_flow(request.yaml_definition, session)
        except Exception as e:
            session.close()
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Flow validation failed",
                    "validation_error": str(e),
                    "error_type": type(e).__name__,
                    "hint": "Check that all referenced agents exist and have versions"
                }
            )
        finally:
            session.close()
        
        if not validation["valid"]:
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": "Invalid flow definition",
                    "message": "Flow validation failed",
                    "errors": validation.get("errors", []),
                    "warnings": validation.get("warnings", []),
                    "hint": "Check that all steps reference valid agents with versions"
                }
            )
        
        # Create the flow
        try:
            flow = create_flow(request.name, request.yaml_definition)
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)
            print(f"\n{'='*80}")
            print(f"Error creating flow: {error_type}")
            print(f"Error message: {error_msg}")
            print(f"Flow name: {request.name}")
            print(f"YAML length: {len(request.yaml_definition)} chars")
            print(traceback.format_exc())
            print(f"{'='*80}\n")
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Failed to create flow",
                    "error_type": error_type,
                    "error_message": error_msg,
                    "hint": "Check server logs for details"
                }
            )
        
        return {
            "id": flow.id,
            "name": flow.name,
            "created_at": flow.created_at.isoformat() if flow.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"\n{'='*80}")
        print(f"Unexpected error in create_flow_endpoint: {error_type}")
        print(f"Error message: {error_msg}")
        print(traceback.format_exc())
        print(f"{'='*80}\n")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal server error",
                "error_type": error_type,
                "error_message": error_msg
            }
        )


@app.get("/api/flows/{flow_id}")
async def get_flow_endpoint(flow_id: int):
    """Get a flow by ID."""
    from src.flow.registry import get_flow_detail
    try:
        flow = get_flow_detail(flow_id)
        if not flow:
            raise HTTPException(status_code=404, detail="Flow not found")
        return flow
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    yaml_definition: Optional[str] = None


@app.put("/api/flows/{flow_id}")
async def update_flow_endpoint(flow_id: int, request: FlowUpdate):
    """Update a flow."""
    from src.flow.registry import update_flow, get_flow
    from src.flow.compiler import validate_flow
    from src.db import get_session
    import traceback
    import yaml
    
    # Log incoming request for debugging
    print(f"\n{'='*80}")
    print(f"[update_flow_endpoint] Received PUT request for flow_id={flow_id}")
    print(f"Request data: name={request.name}, yaml_definition length={len(request.yaml_definition) if request.yaml_definition else 0}")
    print(f"{'='*80}\n")
    
    try:
        print(f"[update_flow_endpoint] Step 1: Checking if flow exists...")
        # Check flow exists
        existing = get_flow(flow_id)
        print(f"[update_flow_endpoint] Flow exists: {existing is not None}")
        if not existing:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "Flow not found",
                    "flow_id": flow_id
                }
            )
        
        print(f"[update_flow_endpoint] Step 2: Validating name...")
        # Validate name if provided
        if request.name is not None:
            print(f"[update_flow_endpoint] Name provided: '{request.name}'")
            if not request.name.strip():
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "Flow name cannot be empty",
                        "field": "name"
                    }
                )
        
        print(f"[update_flow_endpoint] Step 3: Validating YAML...")
        # Validate new YAML if provided
        if request.yaml_definition is not None:
            print(f"[update_flow_endpoint] YAML provided, length: {len(request.yaml_definition)}")
            if not request.yaml_definition.strip():
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "YAML definition cannot be empty",
                        "field": "yaml_definition"
                    }
                )
            
            # Try to parse YAML first
            print(f"[update_flow_endpoint] Step 4: Parsing YAML...")
            print(f"[update_flow_endpoint] YAML content (first 200 chars): {request.yaml_definition[:200]}")
            print(f"[update_flow_endpoint] YAML content (last 200 chars): {request.yaml_definition[-200:]}")
            print(f"[update_flow_endpoint] YAML total length: {len(request.yaml_definition)}")
            try:
                print(f"[update_flow_endpoint] Calling yaml.safe_load()...")
                yaml_data = yaml.safe_load(request.yaml_definition)
                print(f"[update_flow_endpoint] yaml.safe_load() completed")
                print(f"[update_flow_endpoint] YAML parsed successfully")
                print(f"[update_flow_endpoint] YAML data type: {type(yaml_data)}")
                print(f"[update_flow_endpoint] YAML data keys: {list(yaml_data.keys()) if isinstance(yaml_data, dict) else 'Not a dict'}")
                if yaml_data is None:
                    print(f"[update_flow_endpoint] ERROR: YAML parsed to None")
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "error": "YAML is empty or invalid",
                            "field": "yaml_definition",
                            "hint": "YAML must contain at least a 'version' and 'steps' field"
                        }
                    )
            except yaml.YAMLError as e:
                print(f"[update_flow_endpoint] YAML parsing error: {type(e).__name__}: {str(e)}")
                import traceback
                print(traceback.format_exc())
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "Invalid YAML syntax",
                        "field": "yaml_definition",
                        "yaml_error": str(e),
                        "hint": "Check your YAML syntax (indentation, colons, dashes, etc.)"
                    }
                )
            except Exception as e:
                print(f"[update_flow_endpoint] Unexpected error during YAML parsing: {type(e).__name__}: {str(e)}")
                import traceback
                print(traceback.format_exc())
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "YAML parsing failed",
                        "field": "yaml_definition",
                        "error_type": type(e).__name__,
                        "error_message": str(e),
                        "hint": "Check your YAML syntax"
                    }
                )
            
            # Validate the flow structure
            print(f"[update_flow_endpoint] Step 5: Validating flow structure...")
            session = get_session()
            try:
                validation = validate_flow(request.yaml_definition, session)
                print(f"[update_flow_endpoint] Validation result: valid={validation.get('valid')}, errors={len(validation.get('errors', []))}, warnings={len(validation.get('warnings', []))}")
            except Exception as e:
                session.close()
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "Flow validation failed",
                        "validation_error": str(e),
                        "error_type": type(e).__name__,
                        "hint": "Check that all referenced agents exist and have versions"
                    }
                )
            finally:
                session.close()
            
            if not validation["valid"]:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "Invalid flow definition",
                        "message": "Flow validation failed",
                        "errors": validation.get("errors", []),
                        "warnings": validation.get("warnings", []),
                        "hint": "Check that all steps reference valid agents with versions"
                    }
                )
        
        # Update the flow
        print(f"[update_flow_endpoint] Step 6: Updating flow in database...")
        try:
            flow = update_flow(flow_id, request.name, request.yaml_definition)
            print(f"[update_flow_endpoint] Flow updated successfully: id={flow.id}, name={flow.name}")
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)
            print(f"\n{'='*80}")
            print(f"Error updating flow {flow_id}: {error_type}")
            print(f"Error message: {error_msg}")
            print(traceback.format_exc())
            print(f"{'='*80}\n")
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Failed to update flow",
                    "error_type": error_type,
                    "error_message": error_msg,
                    "hint": "Check server logs for details"
                }
            )
        
        print(f"[update_flow_endpoint] Step 7: Returning response...")
        result = {
            "id": flow.id,
            "name": flow.name,
            "updated": True
        }
        print(f"[update_flow_endpoint] Success! Returning: {result}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"\n{'='*80}")
        print(f"Unexpected error in update_flow_endpoint: {error_type}")
        print(f"Error message: {error_msg}")
        print(traceback.format_exc())
        print(f"{'='*80}\n")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal server error",
                "error_type": error_type,
                "error_message": error_msg
            }
        )


@app.delete("/api/flows/{flow_id}")
async def delete_flow_endpoint(flow_id: int):
    """Delete a flow."""
    from src.flow.registry import delete_flow
    try:
        deleted = delete_flow(flow_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Flow not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FlowRunRequest(BaseModel):
    input_text: str
    write_to_neo4j: bool = True


@app.post("/api/flows/{flow_id}/run")
async def run_flow_endpoint(flow_id: int, request: FlowRunRequest):
    """Execute a flow on input text."""
    from src.flow.runner import run_flow
    try:
        result = await run_flow(
            flow_id=flow_id,
            input_text=request.input_text,
            write_to_neo4j=request.write_to_neo4j
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/flows/{flow_id}/runs")
async def get_flow_runs_endpoint(flow_id: int, limit: int = 50, offset: int = 0):
    """Get run history for a flow."""
    from src.flow.registry import get_flow_runs, get_flow
    try:
        # Check flow exists
        flow = get_flow(flow_id)
        if not flow:
            raise HTTPException(status_code=404, detail="Flow not found")
        
        runs = get_flow_runs(flow_id, limit=limit, offset=offset)
        return {"runs": runs}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/flow-runs/{run_id}")
async def get_flow_run_endpoint(run_id: int):
    """Get details of a specific flow run."""
    from src.flow.registry import get_flow_run_detail
    try:
        run = get_flow_run_detail(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Flow run not found")
        return run
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/flow-runs/{run_id}")
async def delete_flow_run_endpoint(run_id: int):
    """Delete a flow run."""
    from src.flow.registry import delete_flow_run
    try:
        deleted = delete_flow_run(run_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Flow run not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/flows/{flow_id}/validate")
async def validate_flow_endpoint(flow_id: int):
    """Validate a flow's YAML definition."""
    from src.flow.compiler import validate_flow
    from src.flow.registry import get_flow
    from src.db import get_session
    
    try:
        flow = get_flow(flow_id)
        if not flow:
            raise HTTPException(status_code=404, detail="Flow not found")
        
        session = get_session()
        result = validate_flow(flow.yaml_definition, session)
        session.close()
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/flows/{flow_id}/graph")
async def get_flow_graph_endpoint(flow_id: int):
    """Get LangGraph visualization as PNG (base64 encoded)."""
    from src.flow.compiler import compile_flow
    from src.flow.registry import get_flow
    from src.db import get_session
    import base64
    
    try:
        flow = get_flow(flow_id)
        if not flow:
            raise HTTPException(status_code=404, detail="Flow not found")
        
        session = get_session()
        model_cache = {}
        
        try:
            # Compile the flow to get the graph
            graph = compile_flow(flow.yaml_definition, session, model_cache)
            
            # Generate PNG using LangGraph's built-in method
            # get_graph() returns a drawable graph object
            png_bytes = graph.get_graph().draw_mermaid_png()
            
            # Encode as base64
            png_base64 = base64.b64encode(png_bytes).decode("utf-8")
            
            return {
                "flow_id": flow_id,
                "flow_name": flow.name,
                "graph_png": png_base64
            }
        finally:
            session.close()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
