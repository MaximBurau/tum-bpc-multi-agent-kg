/**
 * Agents page - Agent management and configuration
 * 
 * Allows users to register, configure, and test individual agents in the system.
 */

import AgentCard from "@/components/agents/AgentCard";

export default function AgentsPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] p-8 bg-gray-950">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-tight">Agents</h1>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 border border-blue-500/50">
            Register New Agent
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AgentCard
            name="Parser"
            description="Normalizes text from PDF/HTML to clean text"
            status="inactive"
          />
          <AgentCard
            name="Entity Extractor"
            description="Finds and extracts entities from text"
            status="inactive"
          />
          <AgentCard
            name="Relation Extractor"
            description="Detects relations between entities"
            status="inactive"
          />
          <AgentCard
            name="Linker"
            description="Resolves conflicts and creates canonical map"
            status="inactive"
          />
          <AgentCard
            name="Evaluator"
            description="Measures knowledge graph quality"
            status="inactive"
          />
          <AgentCard
            name="Example Generator"
            description="Creates domain-relevant examples"
            status="inactive"
          />
        </div>
      </div>
    </main>
  );
}
