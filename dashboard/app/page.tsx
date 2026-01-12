"use client";

import { useState, useEffect } from "react";
import { apiClient, ModelOption } from "@/lib/api/client";
import ModelPicker from "@/components/llm/ModelPicker";

/**
 * Pipeline Runner - Main evaluation interface
 */

interface RunResult {
  run_id: number;
  task_type: string;
  metrics: Record<string, number>;
  duration_seconds: number;
  num_examples: number;
  outputs?: {
    doc_details?: Array<{
      doc_index: number;
      text: string;
      predicted_triples: Array<[string, string, string]>;
      gold_triples: Array<[string, string, string]>;
      true_positives: number;
      false_positives: number;
      false_negatives: number;
      error?: string;
    }>;
  };
}

interface Flow {
  id: number;
  name: string;
}

export default function PipelineRunner() {
  const [taskType, setTaskType] = useState<"qa" | "ner" | "intrinsic_eval" | "oneke_compare">("qa");
  const [limit, setLimit] = useState<number>(10);
  const [model, setModel] = useState<string>("meta-llama/Llama-3.1-8B-Instruct");
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [tags, setTags] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<number | undefined>(undefined);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);

  // Load models on mount
  useEffect(() => {
    apiClient.getModels().then((response) => {
      if (response.data?.models) {
        setModels(response.data.models);
      }
    });
  }, []);

  // Load flows when intrinsic_eval or oneke_compare is selected
  useEffect(() => {
    if (taskType === "intrinsic_eval" || taskType === "oneke_compare") {
      setLoadingFlows(true);
      setFlows([]);
      setSelectedFlowId(undefined);
      
      apiClient.getFlows()
        .then((response) => {
          if (response.data?.flows) {
            setFlows(response.data.flows);
            // Auto-select redocred_eval_flow if it exists
            const redocredFlow = response.data.flows.find((f: Flow) => f.name === "redocred_eval_flow");
            if (redocredFlow) {
              setSelectedFlowId(redocredFlow.id);
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load flows:", err);
          setFlows([]);
        })
        .finally(() => {
          setLoadingFlows(false);
        });
    } else {
      setSelectedFlowId(undefined);
      setFlows([]);
      setLoadingFlows(false);
    }
  }, [taskType]);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setShowDetails(false);

    try {
      const tagsList = tags.split(",").map(t => t.trim()).filter(t => t);
      const response = await apiClient.runPipeline(
        taskType,
        limit,
        undefined,
        systemPrompt || undefined,
        model,
        tagsList.length > 0 ? tagsList : undefined,
        (taskType === "intrinsic_eval" || taskType === "oneke_compare") ? selectedFlowId : undefined
      );
      
      if (response.error) {
        setError(response.error);
      } else {
        setResult(response.data as RunResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-white">
            Pipeline Runner
          </h1>
          <p className="text-sm text-gray-400">
            Run evaluation pipelines and measure performance
          </p>
        </div>

        {/* Configuration Panel */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4 space-y-4">
          <h2 className="text-sm font-medium text-gray-300">Configuration</h2>

          {/* Task Type Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">
              Task Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTaskType("qa")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  taskType === "qa"
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Question Answering
              </button>
              <button
                onClick={() => setTaskType("ner")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  taskType === "ner"
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Named Entity Recognition
              </button>
              <button
                onClick={() => setTaskType("intrinsic_eval")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  taskType === "intrinsic_eval"
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Intrinsic Eval (ReDocRED)
              </button>
              <button
                onClick={() => setTaskType("oneke_compare")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  taskType === "oneke_compare"
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                OneKE Comparison
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Model Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">
                Model
              </label>
              {taskType === "intrinsic_eval" ? (
                <div className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-500 opacity-50">
                  Model set by flow
                </div>
              ) : (
                <ModelPicker
                  value={model}
                  onChange={setModel}
                  models={models}
                />
              )}
              {taskType === "oneke_compare" && (
                <p className="text-xs text-gray-500">Used by OneKE baseline (flow uses its own model)</p>
              )}
            </div>

            {/* Limit Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">
                Number of Examples
              </label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
                min={1}
                max={1000}
                className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-600"
              />
            </div>
          </div>

          {/* Flow Selection for Intrinsic Eval and OneKE Comparison */}
          {(taskType === "intrinsic_eval" || taskType === "oneke_compare") && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">
                {taskType === "oneke_compare" ? "Flow (Required)" : "Flow (Optional - uses default agent if not selected)"}
              </label>
              <select
                value={selectedFlowId || ""}
                onChange={(e) => setSelectedFlowId(e.target.value ? parseInt(e.target.value) : undefined)}
                disabled={loadingFlows}
                className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingFlows ? (
                  <option value="">Loading flows...</option>
                ) : (
                  <>
                    <option value="">Use default agent (no flow)</option>
                    {flows.map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name} (ID: {flow.id})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          )}

          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">
              System Prompt (Optional)
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              placeholder="Override default system prompt..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600 font-mono resize-none"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., baseline, experiment-1, high-quality"
              className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600"
            />
          </div>

          {/* Run Button */}
          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`w-full py-2 rounded text-sm font-medium transition-colors ${
              isRunning
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : "bg-gray-700 text-white hover:bg-gray-600"
            }`}
          >
            {isRunning ? "Running..." : "Run Pipeline"}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-300">Results</h2>
              <span className="text-xs text-gray-500">
                Run ID: {result.run_id}
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(result.metrics).map(([key, value]) => {
                // Statistics (precision, recall, f1) should show decimals, others as integers
                const isStatistic = ["precision", "recall", "f1"].includes(key);
                const displayValue = typeof value === "number"
                  ? (isStatistic ? value.toFixed(4) : Number.isInteger(value) ? value.toString() : Math.round(value).toString())
                  : value;
                return (
                  <div
                    key={key}
                    className="bg-gray-900 border border-gray-800 rounded p-3"
                  >
                    <p className="text-xs text-gray-400 capitalize mb-1">
                      {key.replace(/_/g, " ")}
                    </p>
                    <p className="text-lg font-semibold text-white">
                      {displayValue}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Run Info */}
            <div className="flex gap-4 text-xs text-gray-400 pt-2 border-t border-gray-800">
              <span>Duration: {result.duration_seconds.toFixed(2)}s</span>
              <span>Examples: {result.num_examples}</span>
              <span className="capitalize">Task: {result.task_type}</span>
            </div>

            {/* Warning for skipped documents due to token limit */}
            {result.task_type === "intrinsic_eval" && result.metrics.num_docs_skipped && result.metrics.num_docs_skipped > 0 && (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-md p-3">
                <p className="text-sm text-yellow-400 font-medium">
                  ⚠️ Warning: {result.metrics.num_docs_skipped} document{result.metrics.num_docs_skipped !== 1 ? 's' : ''} skipped due to token limit
                </p>
              </div>
            )}

            {/* Expandable Details for Intrinsic Evaluation with ReDocRED */}
            {result.task_type === "intrinsic_eval" && result.outputs?.doc_details && result.outputs.doc_details.length > 0 && (
              <div className="pt-2 border-t border-gray-800">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center justify-between w-full text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
                >
                  <span>{showDetails ? "Hide" : "Show"} Detailed Results</span>
                  <span className="text-lg">{showDetails ? "−" : "+"}</span>
                </button>

                {showDetails && (
                  <div className="mt-4 space-y-4">
                    {result.outputs.doc_details.map((doc, docIdx) => {
                      // Calculate TP, FP, FN for this document
                      const predSet = new Set(doc.predicted_triples.map(t => JSON.stringify(t)));
                      const goldSet = new Set(doc.gold_triples.map(t => JSON.stringify(t)));
                      
                      const tp = doc.predicted_triples.filter(t => goldSet.has(JSON.stringify(t)));
                      const fp = doc.predicted_triples.filter(t => !goldSet.has(JSON.stringify(t)));
                      const fn = doc.gold_triples.filter(t => !predSet.has(JSON.stringify(t)));

                      return (
                        <div key={docIdx} className="bg-gray-900 border border-gray-800 rounded p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-medium text-gray-300">Document #{doc.doc_index}</h3>
                            <div className="flex gap-3 text-xs">
                              <span className="text-green-400">TP: {tp.length}</span>
                              <span className="text-red-400">FP: {fp.length}</span>
                              <span className="text-yellow-400">FN: {fn.length}</span>
                            </div>
                          </div>

                          {/* Error Message */}
                          {doc.error && (
                            <div className="bg-yellow-900/30 border border-yellow-700 rounded p-2">
                              <p className="text-xs text-yellow-400 font-medium">⚠️ {doc.error}</p>
                            </div>
                          )}

                          {/* Text */}
                          <div>
                            <h4 className="text-xs font-medium text-gray-400 mb-2">Document Text</h4>
                            <div className="bg-gray-950 border border-gray-800 rounded p-3 text-xs text-gray-300 max-h-48 overflow-y-auto">
                              {doc.text || "N/A"}
                            </div>
                          </div>

                          {/* First 20 Predicted Triples */}
                          <div>
                            <h4 className="text-xs font-medium text-gray-400 mb-2">
                              Predicted Triples (First 20 of {doc.predicted_triples.length})
                            </h4>
                            <div className="bg-gray-950 border border-gray-800 rounded p-3 max-h-64 overflow-y-auto space-y-1">
                              {doc.predicted_triples.slice(0, 20).map((triple, idx) => (
                                <div key={idx} className="text-xs text-gray-300 font-mono">
                                  <span className="text-blue-400">({triple[0]}</span>
                                  <span className="text-gray-500">, </span>
                                  <span className="text-purple-400">{triple[1]}</span>
                                  <span className="text-gray-500">, </span>
                                  <span className="text-green-400">{triple[2]}</span>
                                  <span className="text-gray-500">)</span>
                                </div>
                              ))}
                              {doc.predicted_triples.length === 0 && (
                                <p className="text-xs text-gray-600">No predicted triples</p>
                              )}
                              {doc.predicted_triples.length > 20 && (
                                <p className="text-xs text-gray-500 italic">
                                  ... and {doc.predicted_triples.length - 20} more
                                </p>
                              )}
                            </div>
                          </div>

                          {/* First 20 Gold Triples */}
                          <div>
                            <h4 className="text-xs font-medium text-gray-400 mb-2">
                              Gold Triples (First 20 of {doc.gold_triples.length})
                            </h4>
                            <div className="bg-gray-950 border border-gray-800 rounded p-3 max-h-64 overflow-y-auto space-y-1">
                              {doc.gold_triples.slice(0, 20).map((triple, idx) => (
                                <div key={idx} className="text-xs text-gray-300 font-mono">
                                  <span className="text-blue-400">({triple[0]}</span>
                                  <span className="text-gray-500">, </span>
                                  <span className="text-purple-400">{triple[1]}</span>
                                  <span className="text-gray-500">, </span>
                                  <span className="text-green-400">{triple[2]}</span>
                                  <span className="text-gray-500">)</span>
                                </div>
                              ))}
                              {doc.gold_triples.length === 0 && (
                                <p className="text-xs text-gray-600">No gold triples</p>
                              )}
                              {doc.gold_triples.length > 20 && (
                                <p className="text-xs text-gray-500 italic">
                                  ... and {doc.gold_triples.length - 20} more
                                </p>
                              )}
                            </div>
                          </div>

                          {/* First 20 False Positives */}
                          {fp.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-red-400 mb-2">
                                False Positives (First 20 of {fp.length})
                              </h4>
                              <div className="bg-gray-950 border border-red-900/30 rounded p-3 max-h-64 overflow-y-auto space-y-1">
                                {fp.slice(0, 20).map((triple, idx) => (
                                  <div key={idx} className="text-xs text-gray-300 font-mono">
                                    <span className="text-blue-400">({triple[0]}</span>
                                    <span className="text-gray-500">, </span>
                                    <span className="text-purple-400">{triple[1]}</span>
                                    <span className="text-gray-500">, </span>
                                    <span className="text-green-400">{triple[2]}</span>
                                    <span className="text-gray-500">)</span>
                                  </div>
                                ))}
                                {fp.length > 20 && (
                                  <p className="text-xs text-gray-500 italic">
                                    ... and {fp.length - 20} more
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* First 20 False Negatives */}
                          {fn.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-yellow-400 mb-2">
                                False Negatives (First 20 of {fn.length})
                              </h4>
                              <div className="bg-gray-950 border border-yellow-900/30 rounded p-3 max-h-64 overflow-y-auto space-y-1">
                                {fn.slice(0, 20).map((triple, idx) => (
                                  <div key={idx} className="text-xs text-gray-300 font-mono">
                                    <span className="text-blue-400">({triple[0]}</span>
                                    <span className="text-gray-500">, </span>
                                    <span className="text-purple-400">{triple[1]}</span>
                                    <span className="text-gray-500">, </span>
                                    <span className="text-green-400">{triple[2]}</span>
                                    <span className="text-gray-500">)</span>
                                  </div>
                                ))}
                                {fn.length > 20 && (
                                  <p className="text-xs text-gray-500 italic">
                                    ... and {fn.length - 20} more
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
