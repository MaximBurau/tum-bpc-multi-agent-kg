# Multi-Agent Knowledge Graph Dashboard

Modern Next.js 16 dashboard for the multi-agent knowledge graph construction system.

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Project Structure

```
dashboard/
├── app/                  # Next.js 16 App Router pages
│   ├── page.tsx         # Home page
│   ├── agents/          # Agent management
│   ├── pipeline/        # Pipeline runner
│   ├── kg-viz/          # Knowledge graph visualization
│   └── llm/             # LLM playground
├── components/          # Reusable components
│   ├── layout/          # Navigation and layout
│   ├── agents/          # Agent-specific components
│   ├── pipeline/        # Pipeline components
│   ├── kg-viz/          # Graph visualization
│   └── llm/             # LLM components
└── lib/                 # Utilities and API client
    ├── api/             # API client for Python backend
    └── utils/           # Helper functions
```

## Features

### Pages

- **Home**: Dashboard overview with quick stats and actions
- **Agents**: Register, configure, and test individual agents
- **Pipeline**: Visual pipeline builder for experimenting with agent combinations
- **KG Visualization**: Interactive Neo4j graph visualization
- **LLM Playground**: Test prompts and Pydantic schemas

### Backend Integration

The dashboard is designed to communicate with the Python backend via REST API. Configure the API URL in `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Backend API endpoints expected:
- `GET /api/agents` - List all agents
- `POST /api/agents/:name/test` - Test an agent
- `POST /api/pipeline/run` - Run pipeline
- `POST /api/llm/test` - Test LLM with prompts
- `GET /api/kg` - Get knowledge graph data

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Graph Visualization**: vis-network
- **State Management**: React hooks

## Development Guidelines

- Keep components small and focused
- Use TypeScript interfaces for props
- Follow the established file structure
- Write clean, professional documentation
- Avoid over-engineering
