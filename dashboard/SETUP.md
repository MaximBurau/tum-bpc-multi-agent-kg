# Dashboard Setup Complete

## Running the Full Stack

### Backend (Python API)

1. Install Python dependencies:
```bash
cd ..  # Go to project root
source .venv/bin/activate  # or: uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
```

2. Set up environment variables in `.env`:
```
OPENROUTER_API_KEY=your-key-here
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password
```

3. Start the API server:
```bash
python api.py
```

API will run at http://localhost:8000

### Frontend (Next.js Dashboard)

1. Install dependencies:
```bash
cd dashboard
pnpm install
```

2. Start dev server:
```bash
pnpm dev
```

Dashboard will run at http://localhost:3000

## Features

### LLM Playground (Connected)
- **Unstructured outputs**: Regular text responses
- **Structured outputs**: Use Pydantic schemas (Entity, Relation, etc.)
- **Models available**:
  - OpenAI GPT-4o
  - OpenAI GPT-4
  - Claude 3 Opus
  - Claude 3 Sonnet
  - **Qwen 2.5 72B** (cheap alternative)
- Adjustable temperature
- Real-time testing via API

### Neo4j Integration
- Backend connects to Neo4j via `neo4j_client.py`
- Graph data exposed via `/api/kg` endpoint
- Frontend displays graph in KG Visualization page

### API Endpoints

- `POST /api/llm/test` - Test LLM with prompts
- `GET /api/kg` - Get knowledge graph data
- `GET /api/agents` - List available agents
- `GET /health` - Health check

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: FastAPI, Python 3.11
- **LLM**: OpenRouter (via instructor + Pydantic)
- **Database**: Neo4j
- **Visualization**: vis-network

## Next Steps

1. Set up Neo4j database (local or cloud)
2. Configure `.env` with Neo4j credentials
3. Start both backend and frontend
4. Test LLM playground
5. Visualize graph data
