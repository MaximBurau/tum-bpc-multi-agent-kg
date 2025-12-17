"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient, Flow } from "@/lib/api/client";
import FlowComparison from "@/components/FlowComparison";

const DEFAULT_YAML = `version: 1
steps:
  - id: entity
    agent: entity_extractor@1
    inputs:
      text: state.text
    outputs:
      entities: output.entities

  - id: relation
    agent: relation_extractor@1
    inputs:
      text: state.text
      entities: state.entities
    outputs:
      relations: output.relations
`;

/**
 * Flows page - List and manage pipeline flows
 */

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create flow state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newFlow, setNewFlow] = useState({
    name: "",
    yaml: DEFAULT_YAML,
  });

  useEffect(() => {
    fetchFlows();
  }, []);

  const fetchFlows = async () => {
    setLoading(true);
    const response = await apiClient.getFlows();
    if (response.error) {
      setError(response.error);
    } else if (response.data) {
      setFlows(response.data.flows);
    }
    setLoading(false);
  };

  const handleDelete = async (flowId: number) => {
    if (!confirm("Are you sure you want to delete this flow?")) return;
    
    const response = await apiClient.deleteFlow(flowId);
    if (response.error) {
      setError(response.error);
    } else {
      fetchFlows();
    }
  };

  const handleCreate = async () => {
    if (!newFlow.name.trim() || !newFlow.yaml.trim()) {
      setError("Name and YAML definition are required");
      return;
    }

    setCreateLoading(true);
    const response = await apiClient.createFlow({ name: newFlow.name, yaml_definition: newFlow.yaml });
    if (response.error) {
      setError(response.error);
    } else if (response.data) {
      setShowCreateForm(false);
      setNewFlow({ name: "", yaml: DEFAULT_YAML });
      fetchFlows();
      router.push(`/flows/${response.data.id}`);
    }
    setCreateLoading(false);
  };

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-gray-400">Loading flows...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-white">Flows</h1>
            <p className="text-sm text-gray-400">
              Multi-step pipelines for knowledge graph extraction
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500"
          >
            + New Flow
          </button>
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3 flex justify-between items-center">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">Dismiss</button>
          </div>
        )}

        {/* Create Flow Form */}
        {showCreateForm && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4 space-y-4">
            <h3 className="text-sm font-medium text-white">Create New Flow</h3>
            
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Flow Name</label>
              <input
                type="text"
                value={newFlow.name}
                onChange={(e) => setNewFlow({...newFlow, name: e.target.value})}
                placeholder="my_custom_flow"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">YAML Definition</label>
              <textarea
                value={newFlow.yaml}
                onChange={(e) => setNewFlow({...newFlow, yaml: e.target.value})}
                rows={16}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600 font-mono resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={createLoading || !newFlow.name.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
              >
                {createLoading ? "Creating..." : "Create Flow"}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-gray-800 text-gray-300 text-sm rounded hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Flows List */}
        <div className="space-y-3">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="bg-gray-900/50 border border-gray-800 rounded-md p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-800 rounded flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">{flow.name}</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500">
                        ID: {flow.id}
                      </span>
                      <span className="text-xs text-gray-500">
                        {flow.run_count || 0} runs
                      </span>
                      <span className="text-xs text-gray-500">
                        Created: {new Date(flow.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/flows/${flow.id}`}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 transition-colors"
                  >
                    View & Run
                  </Link>
                  <button
                    onClick={() => handleDelete(flow.id)}
                    className="px-3 py-1.5 bg-gray-800 text-gray-400 text-xs rounded hover:bg-red-900/50 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

          {flows.length === 0 && !error && (
            <div className="text-center py-8 text-gray-500">
              No flows found. Create a new flow to get started.
            </div>
          )}
        </div>

        {/* Flow Comparison Section */}
        {flows.length > 0 && (
          <FlowComparison flows={flows} />
        )}

      </div>
    </main>
  );
}

