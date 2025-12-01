"use client";

import { useState, useRef, useEffect } from "react";
import { apiClient, Flow, FlowRunResult } from "@/lib/api/client";
import StructuredOutput from "./StructuredOutput";

interface FlowComparisonProps {
  flows: Flow[];
}

interface SelectedFlow {
  id: number;
  name: string;
}

/**
 * Flow Comparison Component
 * Allows selecting 1-3 flows, running them in parallel on the same input,
 * and displaying side-by-side results with step-by-step view and dedicated diff section.
 */
export default function FlowComparison({ flows }: FlowComparisonProps) {
  const [selectedFlows, setSelectedFlows] = useState<SelectedFlow[]>([]);
  const [showFlowDropdown, setShowFlowDropdown] = useState(false);
  const [inputMethod, setInputMethod] = useState<"text" | "file">("text");
  const [inputText, setInputText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [writeToNeo4j, setWriteToNeo4j] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<(FlowRunResult & { flowId: number; flowName: string; flowYaml?: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  const availableFlows = flows.filter(f => !selectedFlows.some(sf => sf.id === f.id));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowFlowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddFlow = (flow: Flow) => {
    if (selectedFlows.length >= 3) {
      setError("Maximum 3 flows can be compared");
      return;
    }
    setSelectedFlows([...selectedFlows, { id: flow.id, name: flow.name }]);
    setShowFlowDropdown(false);
    setError(null);
  };

  const handleRemoveFlow = (flowId: number) => {
    setSelectedFlows(selectedFlows.filter(sf => sf.id !== flowId));
    setResults(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setInputText(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleRunComparison = async () => {
    if (selectedFlows.length === 0) {
      setError("Please select at least one flow");
      return;
    }

    const text = inputText.trim();
    if (!text) {
      setError("Please enter text or upload a file");
      return;
    }

    setRunning(true);
    setError(null);
    setResults(null);
    setExpandedSteps({});

    try {
      // Run all flows in parallel
      const promises = selectedFlows.map(flow =>
        apiClient.runFlow(flow.id, text, writeToNeo4j).then(response => ({
          ...response,
          flowId: flow.id,
          flowName: flow.name,
        }))
      );

      const responses = await Promise.all(promises);
      
      // Check for errors
      const errors = responses.filter(r => r.error);
      if (errors.length > 0) {
        setError(`Some flows failed: ${errors.map(e => e.error).join(", ")}`);
        setRunning(false);
        return;
      }

      const successfulResults = responses
        .filter(r => r.data)
        .map(r => ({ ...r.data!, flowId: r.flowId!, flowName: r.flowName! }));

      // Fetch flow YAML for each result to enable step output detection
      const resultsWithYaml = await Promise.all(
        successfulResults.map(async (result) => {
          try {
            const flowResponse = await apiClient.getFlow(result.flowId);
            return {
              ...result,
              flowYaml: flowResponse.data?.yaml_definition,
            };
          } catch {
            return result;
          }
        })
      );

      setResults(resultsWithYaml);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run comparison");
    } finally {
      setRunning(false);
    }
  };

  // Helper to get step output keys (similar to flow detail page)
  const getStepOutputKeys = (stepId: string, output: Record<string, unknown>, flowYaml?: string): string[] => {
    const allOutputKeys = Object.keys(output).filter(key => !key.startsWith("_"));
    if (allOutputKeys.length === 0) return [];
    
    // Try to parse flow YAML to get actual output mappings
    if (flowYaml) {
      try {
        const stepMatch = new RegExp(`-\\s+id:\\s+${stepId}[\\s\\S]*?outputs:([\\s\\S]*?)(?:-\\s+id:|$)`, 'i').exec(flowYaml);
        if (stepMatch) {
          const outputsSection = stepMatch[1];
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
        // YAML parsing failed, fall through
      }
    }
    
    return allOutputKeys;
  };

  // Calculate diffs for output sections
  const calculateDiffs = () => {
    if (!results || results.length < 2) return null;

    const diffs: Record<string, {
      shared: unknown[];
      unique: Record<number, unknown[]>;
      missing: Record<number, unknown[]>;
    }> = {};

    // Get all output keys that exist in any flow
    const allKeys = new Set<string>();
    results.forEach(r => {
      Object.keys(r.output).filter(k => !k.startsWith("_")).forEach(k => allKeys.add(k));
    });

    allKeys.forEach(key => {
      // Collect all items from all flows for this key
      const allItems: Record<number, unknown[]> = {};
      results.forEach((r, idx) => {
        const value = r.output[key];
        if (Array.isArray(value)) {
          allItems[idx] = value as unknown[];
        } else {
          allItems[idx] = [];
        }
      });

      // For arrays, compare items
      if (results.every(r => Array.isArray(r.output[key]))) {
        const itemsByKey: Map<string, { flowIndices: number[]; item: unknown }> = new Map();
        
        // Index items by their comparison key
        results.forEach((r, flowIdx) => {
          const items = (r.output[key] as unknown[]) || [];
          items.forEach(item => {
            const itemObj = item as Record<string, unknown>;
            let comparisonKey = "";
            
            // Create comparison key based on structure
            if (key === "entities" && itemObj.name) {
              comparisonKey = `entity:${itemObj.name}`;
            } else if (key === "relations" && itemObj.head && itemObj.relation && itemObj.tail) {
              comparisonKey = `rel:${itemObj.head}|${itemObj.relation}|${itemObj.tail}`;
            } else if (itemObj.id) {
              comparisonKey = `id:${itemObj.id}`;
            } else {
              comparisonKey = JSON.stringify(item);
            }

            if (!itemsByKey.has(comparisonKey)) {
              itemsByKey.set(comparisonKey, { flowIndices: [], item });
            }
            itemsByKey.get(comparisonKey)!.flowIndices.push(flowIdx);
          });
        });

        // Categorize items
        const shared: unknown[] = [];
        const unique: Record<number, unknown[]> = {};
        const missing: Record<number, unknown[]> = {};

        results.forEach((_, flowIdx) => {
          unique[flowIdx] = [];
          missing[flowIdx] = [];
        });

        itemsByKey.forEach(({ flowIndices, item }) => {
          if (flowIndices.length === results.length) {
            // Present in all flows
            shared.push(item);
          } else {
            // Present in some flows
            flowIndices.forEach(idx => {
              unique[idx].push(item);
            });
            results.forEach((_, idx) => {
              if (!flowIndices.includes(idx)) {
                missing[idx].push(item);
              }
            });
          }
        });

        diffs[key] = { shared, unique, missing };
      }
    });

    return diffs;
  };

  const toggleStep = (flowId: number, stepId: string) => {
    const key = `${flowId}-${stepId}`;
    setExpandedSteps(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-white">Compare Flows</h2>
          <p className="text-xs text-gray-500 mt-0.5">Run up to 3 flows side-by-side on the same input</p>
        </div>
      </div>

      {/* Flow Selection */}
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400">Select Flows ({selectedFlows.length}/3)</label>
        <div className="flex flex-wrap gap-2 items-center">
          {selectedFlows.map(flow => (
            <div
              key={flow.id}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300"
            >
              <span>{flow.name}</span>
              <button
                onClick={() => handleRemoveFlow(flow.id)}
                className="text-gray-400 hover:text-gray-300"
              >
                ✕
              </button>
            </div>
          ))}
          
          {selectedFlows.length < 3 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowFlowDropdown(!showFlowDropdown)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 hover:bg-gray-700 transition-colors"
              >
                + Add Flow
              </button>
              
              {showFlowDropdown && availableFlows.length > 0 && (
                <div className="absolute z-10 mt-1 w-48 bg-gray-900 border border-gray-800 rounded shadow-lg max-h-60 overflow-y-auto">
                  {availableFlows.map(flow => (
                    <button
                      key={flow.id}
                      onClick={() => handleAddFlow(flow)}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                      {flow.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input Method */}
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400">Input Method</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="radio"
              checked={inputMethod === "text"}
              onChange={() => setInputMethod("text")}
              className="rounded"
            />
            Text Input
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="radio"
              checked={inputMethod === "file"}
              onChange={() => setInputMethod("file")}
              className="rounded"
            />
            File Upload
          </label>
        </div>

        {inputMethod === "text" ? (
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to process..."
            rows={5}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600 font-mono resize-none"
          />
        ) : (
          <div>
            <input
              type="file"
              onChange={handleFileUpload}
              accept=".txt,.md"
              className="text-xs text-gray-300 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-800 file:text-gray-300 hover:file:bg-gray-700"
            />
            {uploadedFile && (
              <p className="text-xs text-gray-500 mt-1">Loaded: {uploadedFile.name}</p>
            )}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={writeToNeo4j}
            onChange={(e) => setWriteToNeo4j(e.target.checked)}
            className="rounded bg-gray-800 border-gray-600"
          />
          Write to Neo4j
        </label>
      </div>

      {/* Run Button */}
      <button
        onClick={handleRunComparison}
        disabled={running || selectedFlows.length === 0 || !inputText.trim()}
        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
          running || selectedFlows.length === 0 || !inputText.trim()
            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-500"
        }`}
      >
        {running ? "Running Comparison..." : "Run Comparison"}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3 flex justify-between items-center">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">Dismiss</button>
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div className="space-y-4">
          {/* Results Grid - Step by Step */}
          <div className={`grid gap-4 ${results.length === 1 ? "grid-cols-1" : results.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {results.map((result, flowIndex) => (
              <div
                key={result.flowId}
                className="bg-gray-900/50 border border-gray-800 rounded-md overflow-hidden"
              >
                {/* Flow Header */}
                <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800">
                  <h3 className="text-sm font-medium text-white">{result.flowName}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{result.duration_seconds.toFixed(2)}s</span>
                    {Array.isArray(result.output.entities) && (
                      <span>{result.output.entities.length} entities</span>
                    )}
                    {Array.isArray(result.output.relations) && (
                      <span>{result.output.relations.length} relations</span>
                    )}
                  </div>
                </div>

                {/* Step-by-step outputs (collapsible) */}
                {result.trace && Object.keys(result.trace).length > 0 ? (
                  <div className="divide-y divide-gray-800">
                    {Object.entries(result.trace).map(([stepId, trace]) => {
                      const traceObj = trace as Record<string, unknown>;
                      const agent = traceObj.agent as string || "unknown";
                      const version = traceObj.version as number;
                      const duration = typeof traceObj.duration_seconds === "number" 
                        ? traceObj.duration_seconds.toFixed(2) 
                        : "?";
                      
                      const stepKey = `${result.flowId}-${stepId}`;
                      const isExpanded = expandedSteps[stepKey] ?? false;
                      const stepOutputKeys = getStepOutputKeys(stepId, result.output, result.flowYaml);

                      return (
                        <div key={stepId} className="border-b border-gray-800 last:border-b-0">
                          <button
                            onClick={() => toggleStep(result.flowId, stepId)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-white">{stepId}</span>
                              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                                {agent}@{version}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">{duration}s</span>
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-4 py-3 space-y-3 bg-gray-900/30">
                              {stepOutputKeys.length > 0 ? (
                                stepOutputKeys.map(key => {
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
                                })
                              ) : (
                                <span className="text-xs text-gray-500 italic">No mapped outputs</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-xs text-gray-500">No trace data available</div>
                )}
              </div>
            ))}
          </div>

          {/* Dedicated Diff View Section */}
          {results.length > 1 && (() => {
            const diffs = calculateDiffs();
            if (!diffs || Object.keys(diffs).length === 0) return null;

            return (
              <div className="border-t border-gray-800 pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-300 mb-4">Diff View</h3>
                
                <div className="space-y-4">
                  {Object.entries(diffs).map(([outputKey, diff]) => (
                    <div key={outputKey} className="bg-gray-800/30 border border-gray-700 rounded-lg p-4 space-y-3">
                      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        {outputKey.replace(/_/g, " ")}
                      </h4>

                      {/* Shared Items */}
                      {diff.shared.length > 0 && (
                        <div>
                          <h5 className="text-xs text-gray-500 mb-2">
                            Shared across all flows ({diff.shared.length})
                          </h5>
                          <div className="bg-gray-900/50 rounded p-2">
                            <StructuredOutput data={diff.shared} />
                          </div>
                        </div>
                      )}

                      {/* Unique Items per Flow */}
                      {results.map((result, flowIdx) => {
                        const unique = diff.unique[flowIdx] || [];
                        const missing = diff.missing[flowIdx] || [];
                        
                        if (unique.length === 0 && missing.length === 0) return null;

                        return (
                          <div key={flowIdx} className="border-t border-gray-700 pt-3">
                            <h5 className="text-xs font-medium text-gray-400 mb-2">
                              {result.flowName}
                            </h5>
                            
                            {unique.length > 0 && (
                              <div className="mb-2">
                                <span className="text-xs text-yellow-400 mb-1 block">
                                  Unique to this flow ({unique.length})
                                </span>
                                <div className="bg-yellow-900/10 border border-yellow-800/30 rounded p-2">
                                  <StructuredOutput data={unique} />
                                </div>
                              </div>
                            )}

                            {missing.length > 0 && (
                              <div>
                                <span className="text-xs text-gray-500 mb-1 block">
                                  Missing from this flow ({missing.length})
                                </span>
                                <div className="bg-gray-900/30 border border-gray-700/30 rounded p-2 opacity-60">
                                  <StructuredOutput data={missing} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
