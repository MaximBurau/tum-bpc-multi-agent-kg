"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import yaml from "js-yaml";
import { apiClient, Flow, FlowRun, FlowRunResult, AgentVersion } from "@/lib/api/client";
import StructuredOutput from "@/components/StructuredOutput";
import KnowledgeGraphView from "@/components/KnowledgeGraphView";

/**
 * Helper to determine which output keys belong to which step.
 * Dynamically finds output keys by parsing flow YAML mappings.
 * Falls back to checking all keys if YAML parsing fails.
 */
function getStepOutputKeys(
  stepId: string, 
  output: Record<string, unknown>,
  trace: Record<string, unknown>,
  flowYaml?: string
): string[] {
  // Get all non-internal keys from output (exclude keys starting with "_")
  const allOutputKeys = Object.keys(output).filter(key => !key.startsWith("_"));
  
  if (allOutputKeys.length === 0) {
    return [];
  }
  
  // Try to parse flow YAML to get actual output mappings for this step
  if (flowYaml) {
    try {
      // Simple YAML parsing (basic, but works for our use case)
      const stepMatch = new RegExp(`-\\s+id:\\s+${stepId}[\\s\\S]*?outputs:([\\s\\S]*?)(?:-\\s+id:|$)`, 'i').exec(flowYaml);
      if (stepMatch) {
        const outputsSection = stepMatch[1];
        // Extract state keys from outputs section (e.g., "relations: output.relations" -> "relations")
        const keyMatches = outputsSection.matchAll(/^\s+(\w+):\s+output\./gm);
        const mappedKeys: string[] = [];
        for (const match of keyMatches) {
          const stateKey = match[1];
          if (stateKey in output) {
            mappedKeys.push(stateKey);
          }
        }
        if (mappedKeys.length > 0) {
          return mappedKeys;
        }
      }
    } catch (e) {
      // YAML parsing failed, fall through to return all keys
    }
  }
  
  // Fallback: Return all output keys that exist
  // This makes it dynamic and works regardless of step ID or mapping names
  return allOutputKeys;
}

/**
 * Flow detail page - View, edit, and run flow
 */

export default function FlowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const flowId = parseInt(params.id as string);

  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Run state
  const [inputText, setInputText] = useState("");
  const [writeToNeo4j, setWriteToNeo4j] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FlowRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<"run" | "yaml" | "graph" | "history">("run");
  
  // Graph state
  const [graphPng, setGraphPng] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editedYaml, setEditedYaml] = useState("");
  const [editedName, setEditedName] = useState("");
  const [saving, setSaving] = useState(false);

  // Run history
  const [runs, setRuns] = useState<FlowRun[]>([]);

  // Expanded run detail
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [runDetail, setRunDetail] = useState<FlowRun | null>(null);

  // Validation state for YAML
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null);
  const [validating, setValidating] = useState(false);

  // Agent versions cache keyed by agent type name
  const [agentVersions, setAgentVersions] = useState<Record<string, AgentVersion[]>>({});

  useEffect(() => {
    fetchFlow();
    fetchRuns();
  }, [flowId]);

  const fetchFlow = async () => {
    setLoading(true);
    const response = await apiClient.getFlow(flowId);
    if (response.error) {
      setError(response.error);
    } else if (response.data) {
      setFlow(response.data);
      setEditedYaml(response.data.yaml_definition || "");
      setEditedName(response.data.name);
    }
    setLoading(false);
  };

  const fetchRuns = async () => {
    const response = await apiClient.getFlowRuns(flowId, 20);
    if (response.data) {
      setRuns(response.data.runs);
    }
  };

  const handleValidateFlow = async () => {
    setValidating(true);
    const response = await apiClient.validateFlow(flowId);
    if (response.error) {
      setValidationResult(null);
      setError(response.error);
    } else if (response.data) {
      setValidationResult(response.data);
    }
    setValidating(false);
  };

  // Parse edited YAML to a JS object for helper UIs (best-effort)
  const parsedSpec = useMemo(() => {
    if (!editedYaml.trim()) return null;
    try {
      const doc = yaml.load(editedYaml);
      if (doc && typeof doc === "object" && "steps" in (doc as any)) {
        return doc as { version?: number; steps?: any[] };
      }
      return null;
    } catch {
      return null;
    }
  }, [editedYaml]);

  // When editing YAML, prefetch agent versions for any referenced agent types
  useEffect(() => {
    if (!editing || !parsedSpec?.steps) return;

    const agentNames = new Set<string>();
    for (const step of parsedSpec.steps) {
      if (typeof step?.agent === "string") {
        const ref: string = step.agent;
        const name = ref.includes("@") ? ref.split("@", 1)[0] : ref;
        if (name) agentNames.add(name);
      }
    }

    const missing = Array.from(agentNames).filter((name) => !(name in agentVersions));
    if (missing.length === 0) return;

    (async () => {
      for (const name of missing) {
        const res = await apiClient.getAgentVersions(name);
        if (res.data?.versions) {
          setAgentVersions((prev) => ({ ...prev, [name]: res.data!.versions }));
        }
      }
    })();
  }, [editing, parsedSpec, agentVersions]);

  const handleRun = async () => {
    if (!inputText.trim()) {
      setRunError("Please enter some text to process");
      return;
    }

    setRunning(true);
    setRunError(null);
    setResult(null);

    const response = await apiClient.runFlow(flowId, inputText, writeToNeo4j);
    if (response.error) {
      setRunError(response.error);
    } else if (response.data) {
      setResult(response.data);
      fetchRuns();
    }
    setRunning(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const response = await apiClient.updateFlow(flowId, { 
      name: editedName, 
      yaml_definition: editedYaml 
    });
    if (response.error) {
      setError(response.error);
    } else {
      setEditing(false);
      fetchFlow();
    }
    setSaving(false);
  };

  const fetchRunDetail = async (runId: number) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      setRunDetail(null);
      return;
    }
    const response = await apiClient.getFlowRun(runId);
    if (response.data) {
      setRunDetail(response.data);
      setExpandedRun(runId);
    }
  };

  const fetchGraph = async () => {
    if (graphPng) return; // Already loaded
    setGraphLoading(true);
    const response = await apiClient.getFlowGraph(flowId);
    if (response.data) {
      setGraphPng(response.data.graph_png);
    }
    setGraphLoading(false);
  };

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-gray-400">Loading flow...</div>
        </div>
      </main>
    );
  }

  if (error || !flow) {
    return (
      <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
        <div className="max-w-5xl mx-auto">
          <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3">
            <p className="text-sm text-red-400">{error || "Flow not found"}</p>
          </div>
          <Link href="/flows" className="text-sm text-blue-400 hover:text-blue-300 mt-4 inline-block">
            ← Back to Flows
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/flows" className="text-xs text-gray-500 hover:text-gray-400 mb-1 inline-block">
              ← Back to Flows
            </Link>
            <h1 className="text-2xl font-semibold text-white">{flow.name}</h1>
            <p className="text-sm text-gray-400 mt-1">
              Flow ID: {flow.id} • {flow.run_count || 0} runs
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-800">
          {["run", "yaml", "graph", "history"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab as "run" | "yaml" | "graph" | "history");
                if (tab === "graph") fetchGraph();
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-white border-b-2 border-white -mb-px"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {tab === "run" ? "Run Flow" : tab === "yaml" ? "YAML Editor" : tab === "graph" ? "Graph View" : "Run History"}
            </button>
          ))}
        </div>

        {/* Run Tab */}
        {activeTab === "run" && (
          <div className="space-y-4">
            {/* Input */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">Input Text</label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Enter text to extract knowledge graph from..."
                  rows={5}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600 font-mono resize-none"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <input
                    type="checkbox"
                    checked={writeToNeo4j}
                    onChange={(e) => setWriteToNeo4j(e.target.checked)}
                    className="rounded bg-gray-800 border-gray-600"
                  />
                  Write to Neo4j
                </label>

                <button
                  onClick={handleRun}
                  disabled={running || !inputText.trim()}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    running || !inputText.trim()
                      ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-500"
                  }`}
                >
                  {running ? "Running..." : "Run Flow"}
                </button>
              </div>
            </div>

            {/* Error */}
            {runError && (
              <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3">
                <p className="text-sm text-red-400">{runError}</p>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-300">Results</h3>
                  <span className="text-xs text-gray-500">
                    Run #{result.run_id} • {result.duration_seconds.toFixed(2)}s
                  </span>
                </div>

                {/* Step-by-step results with agent headers */}
                {result.trace && Object.keys(result.trace).length > 0 && (
                  <div className="space-y-4">
                    {Object.entries(result.trace).map(([stepId, trace]) => {
                      const traceObj = trace as Record<string, unknown>;
                      const agent = traceObj.agent as string || "unknown";
                      const version = traceObj.version as number;
                      const duration = typeof traceObj.duration_seconds === "number" 
                        ? traceObj.duration_seconds.toFixed(2) 
                        : "?";
                      
                      // Get outputs for this step from the result output
                      // The flow maps outputs like: entities: output.entities -> state.entities
                      // So we need to find which output keys this step produced
                      const stepOutputKeys = getStepOutputKeys(stepId, result.output, result.trace, flow?.yaml_definition);
                      
                      return (
                        <div key={stepId} className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
                          {/* Step Header */}
                          <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-white">{stepId}</span>
                              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                                {agent}@{version}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">{duration}s</span>
                          </div>
                          
                          {/* Step Outputs */}
                          <div className="p-4 space-y-3">
                            {stepOutputKeys.map(key => {
                              const value = result.output[key];
                              return (
                                <div key={key}>
                                  <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                                    {key.replace(/_/g, " ")}
                                    {Array.isArray(value) && (
                                      <span className="text-gray-600 ml-1 normal-case">
                                        ({(value as unknown[]).length})
                                      </span>
                                    )}
                                  </h5>
                                  <StructuredOutput data={value} />
                                </div>
                              );
                            })}
                            
                            {/* Rendered prompt (collapsible) */}
                            {typeof traceObj.rendered_prompt === "string" && (
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                                  View prompt
                                </summary>
                                <pre className="mt-2 text-xs text-gray-500 bg-gray-950 p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto">
                                  {traceObj.rendered_prompt}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Knowledge Graph Visualization */}
                {(Array.isArray(result.output.entities) || Array.isArray(result.output.relations)) && (
                  <div className="border-t border-gray-800 pt-4">
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                      Knowledge Graph
                    </h4>
                    <KnowledgeGraphView
                      entities={(result.output.entities as Array<{name: string; entity_type?: string}>) || []}
                      relations={(result.output.relations as Array<{head: string; relation: string; tail: string}>) || []}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* YAML Tab */}
        {activeTab === "yaml" && (
          <div className="space-y-4">
            {/* Edit Mode Toggle */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">
                {editing ? "Edit mode" : "View mode"}
              </span>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 bg-gray-700 text-white text-xs rounded hover:bg-gray-600"
                >
                  Edit Flow
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleValidateFlow}
                    disabled={validating}
                    className="px-3 py-1.5 bg-gray-700 text-gray-100 text-xs rounded hover:bg-gray-600 disabled:opacity-50"
                  >
                    {validating ? "Validating..." : "Validate Flow"}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditedYaml(flow.yaml_definition || "");
                      setEditedName(flow.name);
                      setValidationResult(null);
                    }}
                    className="px-3 py-1.5 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Name Editor */}
            {editing && (
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Flow Name</label>
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-600"
                />
              </div>
            )}

            {/* YAML Editor/Viewer */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-md overflow-hidden">
              {editing ? (
                <textarea
                  value={editedYaml}
                  onChange={(e) => setEditedYaml(e.target.value)}
                  rows={20}
                  className="w-full p-4 bg-transparent text-sm text-gray-300 font-mono focus:outline-none resize-none"
                />
              ) : (
                <pre className="p-4 text-sm text-gray-300 font-mono overflow-x-auto whitespace-pre">
                  {flow.yaml_definition}
                </pre>
              )}
            </div>

            {/* Validation result */}
            {validationResult && (
              <div className="bg-gray-900/40 border border-gray-800 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium ${
                      validationResult.valid ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {validationResult.valid ? "Flow is valid" : "Flow has validation errors"}
                  </span>
                </div>
                {!validationResult.valid && validationResult.errors.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-red-300 space-y-1">
                    {validationResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
                {validationResult.warnings.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-yellow-300 space-y-1">
                    {validationResult.warnings.map((warn, idx) => (
                      <li key={idx}>{warn}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* YAML Help */}
            <div className="bg-gray-900/30 border border-gray-800/50 rounded-md p-4">
              <h4 className="text-xs font-medium text-gray-400 mb-2">YAML Structure</h4>
              <pre className="text-xs text-gray-500 font-mono">{`version: 1
steps:
  - id: step_name           # Unique step identifier
    agent: agent_name@1     # Agent type @ version number
    inputs:                 # Map state to agent inputs
      text: state.text
    outputs:                # Map agent outputs to state
      entities: output.entities`}</pre>
            </div>
          </div>
        )}

        {/* Graph Tab */}
        {activeTab === "graph" && (
          <div className="space-y-4">
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-4">LangGraph Visualization</h3>
              
              {graphLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-400">Loading graph visualization...</div>
                </div>
              ) : graphPng ? (
                <div className="flex flex-col items-center">
                  <div className="bg-white rounded-lg p-4 inline-block">
                    <img 
                      src={`data:image/png;base64,${graphPng}`}
                      alt="Flow Graph"
                      className="max-w-full h-auto"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    This diagram shows the flow execution graph generated by LangGraph
                  </p>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>Unable to generate graph visualization.</p>
                  <p className="text-xs mt-1">Make sure the flow YAML is valid and all agents exist.</p>
                </div>
              )}
            </div>

            {/* Graph Legend */}
            <div className="bg-gray-900/30 border border-gray-800/50 rounded-md p-4">
              <h4 className="text-xs font-medium text-gray-400 mb-2">Understanding the Graph</h4>
              <div className="text-xs text-gray-500 space-y-1">
                <p>• <strong>START</strong> - Entry point of the flow</p>
                <p>• <strong>Boxes</strong> - Individual processing steps (agents)</p>
                <p>• <strong>Arrows</strong> - Data flow direction between steps</p>
                <p>• <strong>END</strong> - Exit point where results are returned</p>
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {runs.length > 0 ? (
              runs.map((run) => (
                <div key={run.id} className="bg-gray-900/50 border border-gray-800 rounded-md overflow-hidden">
                  <div 
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-800/30"
                    onClick={() => fetchRunDetail(run.id)}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-white">#{run.id}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          run.status === "completed"
                            ? "bg-green-900/30 text-green-400"
                            : run.status === "failed"
                            ? "bg-red-900/30 text-red-400"
                            : "bg-yellow-900/30 text-yellow-400"
                        }`}
                      >
                        {run.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {run.duration_seconds?.toFixed(2)}s
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-500 max-w-xs truncate">
                        {run.input_text}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(run.created_at).toLocaleString()}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${
                          expandedRun === run.id ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  
                  {/* Expanded Run Detail */}
                  {expandedRun === run.id && runDetail && (
                    <div className="border-t border-gray-800 p-4 space-y-4">
                      {/* Input */}
                      <div>
                        <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Input Text</h5>
                        <p className="text-sm text-gray-300 bg-gray-900 p-3 rounded">{String(runDetail.input_text || '')}</p>
                      </div>
                      
                      {/* Step-by-step output with nice formatting */}
                      {runDetail.trace_json && typeof runDetail.trace_json === 'object' && Object.keys(runDetail.trace_json).length > 0 ? (
                        <div className="space-y-3">
                          {Object.entries(runDetail.trace_json as Record<string, Record<string, unknown>>).map(([stepId, trace]) => {
                            const agent = trace.agent as string || "unknown";
                            const version = trace.version as number;
                            const duration = typeof trace.duration_seconds === "number" 
                              ? trace.duration_seconds.toFixed(2) 
                              : "?";
                            const outputJson = runDetail.output_json as Record<string, unknown> || {};
                            const stepOutputKeys = getStepOutputKeys(stepId, outputJson, runDetail.trace_json as Record<string, unknown>, flow?.yaml_definition);
                            
                            return (
                              <div key={stepId} className="bg-gray-800/30 border border-gray-700/50 rounded-lg overflow-hidden">
                                <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700/50 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-white">{stepId}</span>
                                    <span className="text-xs text-gray-500">{agent}@{version}</span>
                                  </div>
                                  <span className="text-xs text-gray-500">{duration}s</span>
                                </div>
                                <div className="p-3 space-y-2">
                                  {stepOutputKeys.map(key => (
                                    <div key={key}>
                                      <h6 className="text-xs font-medium text-gray-500 mb-1">
                                        {key.replace(/_/g, " ")}
                                        {Array.isArray(outputJson[key]) && (
                                          <span className="text-gray-600 ml-1">({(outputJson[key] as unknown[]).length})</span>
                                        )}
                                      </h6>
                                      <StructuredOutput data={outputJson[key]} />
                                    </div>
                                  ))}
                                  {stepOutputKeys.length === 0 && (
                                    <span className="text-xs text-gray-500 italic">No mapped outputs</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div>
                          <h5 className="text-xs font-medium text-gray-400 mb-1">Output</h5>
                          <pre className="text-xs text-gray-300 bg-gray-900 p-2 rounded overflow-x-auto">
                            {JSON.stringify(runDetail.output_json, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      {/* Knowledge Graph Visualization */}
                      {runDetail.output_json && (
                        (() => {
                          const output = runDetail.output_json as Record<string, unknown>;
                          const hasKG = Array.isArray(output.entities) || Array.isArray(output.relations);
                          if (!hasKG) return null;
                          return (
                            <div className="border-t border-gray-700 pt-4">
                              <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                                Knowledge Graph
                              </h5>
                              <KnowledgeGraphView
                                entities={(output.entities as Array<{name: string; entity_type?: string}>) || []}
                                relations={(output.relations as Array<{head: string; relation: string; tail: string}>) || []}
                              />
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 bg-gray-900/50 border border-gray-800 rounded-md">
                No runs yet. Try running the flow above!
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

