"use client";

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api/client";

/**
 * Run History - Table-based view similar to MLflow/W&B
 */

interface Run {
  id: number;
  task_type: string;
  prompt: string | null;
  system_prompt: string | null;
  model: string | null;
  metrics: Record<string, number>;
  timestamp: string;
  duration_seconds: number;
  num_examples: number;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
  outputs: {
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
  } | null;
}

function RunDetailsPanel({ run, onClose }: { run: Run; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          Run #{run.id} Details
        </h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-400 text-xs"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Configuration */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-gray-400">Configuration</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Task Type:</span>
              <span className="text-gray-300 uppercase">{run.task_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Model:</span>
              <span className="text-gray-300">{run.model || "Default"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Examples:</span>
              <span className="text-gray-300">{run.num_examples}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Duration:</span>
              <span className="text-gray-300">{run.duration_seconds.toFixed(2)}s</span>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-gray-400">Metrics</h3>
          <div className="space-y-2 text-xs">
            {Object.entries(run.metrics).map(([key, value]) => {
              const isStatistic = ["precision", "recall", "f1"].includes(key);
              const displayValue = typeof value === "number"
                ? (isStatistic ? value.toFixed(4) : Number.isInteger(value) ? value.toString() : Math.round(value).toString())
                : value;
              return (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-500 capitalize">{key.replace(/_/g, " ")}:</span>
                  <span className="text-gray-300 font-mono">
                    {displayValue}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Warning for skipped documents due to token limit */}
      {run.task_type === "intrinsic_eval" && run.metrics.num_docs_skipped && run.metrics.num_docs_skipped > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-md p-3">
          <p className="text-sm text-yellow-400 font-medium">
            ⚠️ Warning: {run.metrics.num_docs_skipped} document{run.metrics.num_docs_skipped !== 1 ? 's' : ''} skipped due to token limit
          </p>
        </div>
      )}

      {/* Prompts */}
      {(run.system_prompt || run.prompt) && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-gray-400">Prompts</h3>
          {run.system_prompt && (
            <div>
              <p className="text-xs text-gray-500 mb-1">System Prompt:</p>
              <pre className="bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-300 overflow-x-auto">
                {run.system_prompt}
              </pre>
            </div>
          )}
          {run.prompt && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Prompt:</p>
              <pre className="bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-300 overflow-x-auto">
                {run.prompt}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Intrinsic Evaluation with ReDocRED Dataset - Detailed Results */}
      {run.task_type === "intrinsic_eval" && run.outputs?.doc_details && (
        <div className="space-y-4">
          <h3 className="text-xs font-medium text-gray-400">Document Details</h3>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {(run.outputs.doc_details as any[]).map((doc: any, idx: number) => {
              // Compute categorized triples from predicted/gold if categorized fields are missing or empty
              let correctPredicted = doc.correct_predicted;
              let wronglyPredicted = doc.wrongly_predicted;
              let missing = doc.missing;
              
              // If categorized fields are missing/empty but we have predicted/gold triples, compute them
              const needsComputation = (!correctPredicted || correctPredicted.length === 0) && 
                                      (!wronglyPredicted || wronglyPredicted.length === 0) &&
                                      doc.predicted_triples && 
                                      doc.gold_triples &&
                                      Array.isArray(doc.predicted_triples) && 
                                      Array.isArray(doc.gold_triples) &&
                                      (doc.predicted_triples.length > 0 || doc.gold_triples.length > 0);
              
              if (needsComputation) {
                const predSet = new Set(doc.predicted_triples.map((t: any[]) => JSON.stringify(t)));
                const goldSet = new Set(doc.gold_triples.map((t: any[]) => JSON.stringify(t)));
                
                correctPredicted = doc.predicted_triples.filter((t: any[]) => goldSet.has(JSON.stringify(t)));
                wronglyPredicted = doc.predicted_triples.filter((t: any[]) => !goldSet.has(JSON.stringify(t)));
                // Only recompute missing if it's also empty, otherwise keep the existing one
                if (!missing || missing.length === 0) {
                  missing = doc.gold_triples.filter((t: any[]) => !predSet.has(JSON.stringify(t)));
                }
              }
              
              // Fallback to empty arrays if still undefined
              correctPredicted = correctPredicted || [];
              wronglyPredicted = wronglyPredicted || [];
              missing = missing || [];
              
              return (
              <div key={idx} className="bg-gray-900 border border-gray-800 rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-300">Document #{doc.doc_index}</span>
                  <div className="flex gap-2 text-xs">
                    <span className="text-green-400">TP: {doc.true_positives}</span>
                    <span className="text-red-400">FP: {doc.false_positives}</span>
                    <span className="text-yellow-400">FN: {doc.false_negatives}</span>
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
                  <p className="text-xs text-gray-500 mb-1">Text:</p>
                  <div className="bg-gray-950 border border-gray-800 rounded p-2 text-xs text-gray-300 max-h-32 overflow-y-auto">
                    {doc.text || "N/A"}
                  </div>
                </div>

                {/* Grid Layout: Correct, Missing, Wrong in 3 columns */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Correctly Predicted Triples */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-green-400">
                      ✓ Correctly Predicted ({correctPredicted?.length || 0})
                    </h4>
                    <div className="bg-gray-950 border border-green-900/30 rounded p-3 min-h-[200px] max-h-[400px] overflow-y-auto space-y-2">
                      {correctPredicted && correctPredicted.length > 0 ? (
                        correctPredicted.map((triple: any[], tIdx: number) => (
                          <div key={tIdx} className="text-xs text-gray-300 font-mono bg-gray-900/50 p-2 rounded border border-gray-800">
                            <span className="text-blue-400">({triple[0]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-purple-400">{triple[1]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-green-400">{triple[2]}</span>
                            <span className="text-gray-500">)</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-600 text-center py-8">No correctly predicted triples</p>
                      )}
                    </div>
                  </div>

                  {/* Missing Triples */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-yellow-400">
                      ⚠ Missing ({missing?.length || 0})
                    </h4>
                    <div className="bg-gray-950 border border-yellow-900/30 rounded p-3 min-h-[200px] max-h-[400px] overflow-y-auto space-y-2">
                      {missing && missing.length > 0 ? (
                        missing.map((triple: any[], tIdx: number) => (
                          <div key={tIdx} className="text-xs text-gray-300 font-mono bg-gray-900/50 p-2 rounded border border-gray-800">
                            <span className="text-blue-400">({triple[0]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-purple-400">{triple[1]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-green-400">{triple[2]}</span>
                            <span className="text-gray-500">)</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-600 text-center py-8">No missing triples</p>
                      )}
                    </div>
                  </div>

                  {/* Wrongly Predicted Triples */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-red-400">
                      ✗ Wrongly Predicted ({wronglyPredicted?.length || 0})
                    </h4>
                    <div className="bg-gray-950 border border-red-900/30 rounded p-3 min-h-[200px] max-h-[400px] overflow-y-auto space-y-2">
                      {wronglyPredicted && wronglyPredicted.length > 0 ? (
                        wronglyPredicted.map((triple: any[], tIdx: number) => (
                          <div key={tIdx} className="text-xs text-gray-300 font-mono bg-gray-900/50 p-2 rounded border border-gray-800">
                            <span className="text-blue-400">({triple[0]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-purple-400">{triple[1]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-green-400">{triple[2]}</span>
                            <span className="text-gray-500">)</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-600 text-center py-8">No wrongly predicted triples</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* OneKE Comparison Results */}
      {run.task_type === "oneke_compare" && run.outputs && (
        <div className="space-y-4">
          {/* Comparison Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Comparison Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-gray-950 rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Flow F1</p>
                <p className="text-xl font-semibold text-blue-400">
                  {((run.outputs as any).comparison?.flow_f1 ?? 0).toFixed(4)}
                </p>
              </div>
              <div className="bg-gray-950 rounded p-3">
                <p className="text-xs text-gray-500 mb-1">OneKE F1</p>
                <p className="text-xl font-semibold text-purple-400">
                  {((run.outputs as any).comparison?.oneke_f1 ?? 0).toFixed(4)}
                </p>
              </div>
              <div className="bg-gray-950 rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Winner</p>
                <p className={`text-xl font-semibold ${
                  (run.outputs as any).comparison?.winner === "flow" ? "text-green-400" :
                  (run.outputs as any).comparison?.winner === "oneke" ? "text-yellow-400" :
                  "text-gray-400"
                }`}>
                  {(run.outputs as any).comparison?.winner === "flow" ? "Flow" :
                   (run.outputs as any).comparison?.winner === "oneke" ? "OneKE" : "Tie"}
                </p>
              </div>
            </div>
          </div>

          {/* Side-by-side metrics */}
          <div className="grid grid-cols-2 gap-4">
            {/* Flow Results */}
            <div className="bg-gray-900 border border-blue-900/50 rounded p-4">
              <h3 className="text-sm font-medium text-blue-400 mb-3">Flow Results</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Precision:</span>
                  <span className="text-gray-300 font-mono">{((run.outputs as any).flow?.precision ?? 0).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Recall:</span>
                  <span className="text-gray-300 font-mono">{((run.outputs as any).flow?.recall ?? 0).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">F1:</span>
                  <span className="text-gray-300 font-mono">{((run.outputs as any).flow?.f1 ?? 0).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">TP / FP / FN:</span>
                  <span className="text-gray-300 font-mono">
                    {(run.outputs as any).flow?.true_positives ?? 0} / {(run.outputs as any).flow?.false_positives ?? 0} / {(run.outputs as any).flow?.false_negatives ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* OneKE Results */}
            <div className="bg-gray-900 border border-purple-900/50 rounded p-4">
              <h3 className="text-sm font-medium text-purple-400 mb-3">OneKE Results</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Precision:</span>
                  <span className="text-gray-300 font-mono">{((run.outputs as any).oneke?.precision ?? 0).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Recall:</span>
                  <span className="text-gray-300 font-mono">{((run.outputs as any).oneke?.recall ?? 0).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">F1:</span>
                  <span className="text-gray-300 font-mono">{((run.outputs as any).oneke?.f1 ?? 0).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">TP / FP / FN:</span>
                  <span className="text-gray-300 font-mono">
                    {(run.outputs as any).oneke?.true_positives ?? 0} / {(run.outputs as any).oneke?.false_positives ?? 0} / {(run.outputs as any).oneke?.false_negatives ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Document-by-Document Comparison */}
          <h3 className="text-xs font-medium text-gray-400">Document Details (Side-by-Side)</h3>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {((run.outputs as any).flow?.doc_details || []).map((flowDoc: any, idx: number) => {
              const onekeDoc = (run.outputs as any).oneke?.doc_details?.[idx];
              return (
                <div key={idx} className="bg-gray-900 border border-gray-800 rounded p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-300">Document #{flowDoc.doc_index}</span>
                  </div>

                  {/* Text (shared) */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Text:</p>
                    <div className="bg-gray-950 border border-gray-800 rounded p-2 text-xs text-gray-300 max-h-32 overflow-y-auto">
                      {onekeDoc?.text || flowDoc.text || "N/A"}
                    </div>
                  </div>

                  {/* Gold Triples (shared) */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      Gold Triples ({onekeDoc?.gold_triples?.length || flowDoc.gold_triples?.length || 0}):
                    </p>
                    <div className="bg-gray-950 border border-gray-800 rounded p-2 max-h-32 overflow-y-auto space-y-1">
                      {(onekeDoc?.gold_triples || flowDoc.gold_triples || []).slice(0, 10).map((triple: any[], tIdx: number) => (
                        <div key={tIdx} className="text-xs text-gray-300 font-mono">
                          <span className="text-blue-400">({triple[0]}</span>
                          <span className="text-gray-500">, </span>
                          <span className="text-purple-400">{triple[1]}</span>
                          <span className="text-gray-500">, </span>
                          <span className="text-green-400">{triple[2]})</span>
                        </div>
                      ))}
                      {(onekeDoc?.gold_triples?.length || flowDoc.gold_triples?.length || 0) > 10 && (
                        <p className="text-xs text-gray-600">... and {(onekeDoc?.gold_triples?.length || flowDoc.gold_triples?.length) - 10} more</p>
                      )}
                    </div>
                  </div>

                  {/* Side-by-side predicted triples */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Flow Predictions */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-blue-400">Flow Predicted ({flowDoc.predicted_triples?.length || 0}):</p>
                        <div className="flex gap-2 text-xs">
                          <span className="text-green-400">TP:{flowDoc.true_positives}</span>
                          <span className="text-red-400">FP:{flowDoc.false_positives}</span>
                          <span className="text-yellow-400">FN:{flowDoc.false_negatives}</span>
                        </div>
                      </div>
                      {flowDoc.error && (
                        <div className="bg-yellow-900/30 border border-yellow-700 rounded p-1 mb-1">
                          <p className="text-xs text-yellow-400">⚠️ {flowDoc.error}</p>
                        </div>
                      )}
                      <div className="bg-gray-950 border border-blue-900/30 rounded p-2 max-h-32 overflow-y-auto space-y-1">
                        {flowDoc.predicted_triples?.slice(0, 10).map((triple: any[], tIdx: number) => (
                          <div key={tIdx} className="text-xs text-gray-300 font-mono">
                            <span className="text-blue-400">({triple[0]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-purple-400">{triple[1]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-green-400">{triple[2]})</span>
                          </div>
                        )) || <p className="text-xs text-gray-600">No predictions</p>}
                        {(flowDoc.predicted_triples?.length || 0) > 10 && (
                          <p className="text-xs text-gray-600">... and {flowDoc.predicted_triples.length - 10} more</p>
                        )}
                      </div>
                    </div>

                    {/* OneKE Predictions */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-purple-400">OneKE Predicted ({onekeDoc?.predicted_triples?.length || 0}):</p>
                        <div className="flex gap-2 text-xs">
                          <span className="text-green-400">TP:{onekeDoc?.true_positives ?? 0}</span>
                          <span className="text-red-400">FP:{onekeDoc?.false_positives ?? 0}</span>
                          <span className="text-yellow-400">FN:{onekeDoc?.false_negatives ?? 0}</span>
                        </div>
                      </div>
                      {onekeDoc?.error && (
                        <div className="bg-yellow-900/30 border border-yellow-700 rounded p-1 mb-1">
                          <p className="text-xs text-yellow-400">⚠️ {onekeDoc.error}</p>
                        </div>
                      )}
                      <div className="bg-gray-950 border border-purple-900/30 rounded p-2 max-h-32 overflow-y-auto space-y-1">
                        {onekeDoc?.predicted_triples?.slice(0, 10).map((triple: any[], tIdx: number) => (
                          <div key={tIdx} className="text-xs text-gray-300 font-mono">
                            <span className="text-blue-400">({triple[0]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-purple-400">{triple[1]}</span>
                            <span className="text-gray-500">, </span>
                            <span className="text-green-400">{triple[2]})</span>
                          </div>
                        )) || <p className="text-xs text-gray-600">No predictions</p>}
                        {(onekeDoc?.predicted_triples?.length || 0) > 10 && (
                          <p className="text-xs text-gray-600">... and {onekeDoc.predicted_triples.length - 10} more</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Outputs (for other non-intrinsic evaluation tasks) */}
      {run.outputs && run.task_type !== "intrinsic_eval" && run.task_type !== "oneke_compare" && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-gray-400">Outputs</h3>
          <pre className="bg-gray-900 border border-gray-800 rounded p-3 text-xs text-gray-300 overflow-x-auto max-h-96">
            {JSON.stringify(run.outputs, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function RunsHistory() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [filterTaskType, setFilterTaskType] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState<string>("");

  const fetchRuns = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.getRuns(
        filterTaskType || undefined,
        100
      );

      if (response.error) {
        setError(response.error);
      } else {
        setRuns((response.data as { runs: Run[] }).runs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [filterTaskType]);

  const handleDelete = async (runId: number) => {
    if (!confirm("Are you sure you want to delete this run?")) return;

    try {
      await apiClient.deleteRun(runId);
      setRuns(runs.filter((r) => r.id !== runId));
      if (expandedRunId === runId) {
        setExpandedRunId(null);
      }
    } catch (err) {
      alert("Failed to delete run");
    }
  };

  const toggleRunDetails = (runId: number) => {
    setExpandedRunId(expandedRunId === runId ? null : runId);
  };

  const handleSaveTags = async (runId: number) => {
    const tags = tagInput.split(",").map(t => t.trim()).filter(t => t);
    try {
      await apiClient.updateRunTags(runId, tags);
      setRuns(runs.map(r => r.id === runId ? { ...r, tags } : r));
      setEditingTags(null);
    } catch (err) {
      alert("Failed to update tags");
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMetricColumns = () => {
    // Only show general metrics in the table (precision, recall, f1)
    // Task-specific metrics (like num_docs_skipped, true_positives, etc.) are shown only in detail view
    const generalMetrics = new Set<string>(["precision", "recall", "f1"]);
    return Array.from(generalMetrics);
  };

  const metricColumns = getMetricColumns();

  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-white">
              Run History
            </h1>
            <p className="text-sm text-gray-400">
              {runs.length} runs
            </p>
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterTaskType("")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filterTaskType === ""
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-750"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterTaskType("qa")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filterTaskType === "qa"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-750"
              }`}
            >
              Q&A
            </button>
            <button
              onClick={() => setFilterTaskType("ner")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filterTaskType === "ner"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-750"
              }`}
            >
              NER
            </button>
            <button
              onClick={() => setFilterTaskType("intrinsic_eval")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filterTaskType === "intrinsic_eval"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-750"
              }`}
            >
              Intrinsic Eval
            </button>
            <button
              onClick={() => setFilterTaskType("oneke_compare")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filterTaskType === "oneke_compare"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-750"
              }`}
            >
              OneKE Compare
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">Loading runs...</p>
          </div>
        )}

        {/* Table */}
        {!isLoading && runs.length > 0 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 w-16">ID</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 w-24">Task</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 w-48">Model</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 w-32">Date</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 w-24">Duration</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 w-20">Examples</th>
                    {metricColumns.map(metric => (
                      <th key={metric} className="text-left px-4 py-2 text-xs font-medium text-gray-400 w-28">
                        {metric.replace(/_/g, " ")}
                      </th>
                    ))}
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 w-32">Tags</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const isExpanded = expandedRunId === run.id;
                    return (
                      <React.Fragment key={run.id}>
                    <tr
                          onClick={() => toggleRunDetails(run.id)}
                      className={`border-b border-gray-800 hover:bg-gray-900/50 cursor-pointer transition-colors ${
                            isExpanded ? "bg-gray-900/70" : ""
                      }`}
                    >
                      <td className="px-4 py-2 text-white font-mono">{run.id}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs uppercase">
                          {run.task_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-300 text-xs">
                        {run.model || "-"}
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">
                        {formatTimestamp(run.timestamp)}
                      </td>
                      <td className="px-4 py-2 text-gray-300 text-xs">
                        {run.duration_seconds.toFixed(2)}s
                      </td>
                      <td className="px-4 py-2 text-gray-300 text-xs">
                        {run.num_examples}
                      </td>
                          {metricColumns.map(metric => {
                            const value = run.metrics[metric];
                            const isStatistic = ["precision", "recall", "f1"].includes(metric);
                            const displayValue = value !== undefined
                              ? typeof value === "number"
                                ? (isStatistic ? value.toFixed(4) : Number.isInteger(value) ? value.toString() : Math.round(value).toString())
                                : value
                              : "-";
                            return (
                        <td key={metric} className="px-4 py-2 text-gray-300 text-xs font-mono">
                                {displayValue}
                        </td>
                            );
                          })}
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        {editingTags === run.id ? (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveTags(run.id);
                                if (e.key === "Escape") setEditingTags(null);
                              }}
                              className="px-2 py-0.5 bg-gray-900 border border-gray-700 rounded text-xs text-white w-32"
                              placeholder="tag1, tag2"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveTags(run.id)}
                              className="px-2 py-0.5 bg-gray-700 text-white rounded text-xs hover:bg-gray-600"
                            >
                              ✓
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingTags(run.id);
                              setTagInput(run.tags?.join(", ") || "");
                            }}
                            className="flex flex-wrap gap-1"
                          >
                            {run.tags && run.tags.length > 0 ? (
                              run.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs"
                                >
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-600 text-xs">+ Add tags</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDelete(run.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                        {isExpanded && (
                          <tr className="border-b border-gray-800">
                            <td colSpan={6 + metricColumns.length + 2} className="px-4 py-4 bg-gray-900/30">
                              <RunDetailsPanel run={run} onClose={() => setExpandedRunId(null)} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No runs */}
        {!isLoading && runs.length === 0 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-md p-12 text-center">
            <p className="text-sm text-gray-400">No runs found</p>
          </div>
        )}
      </div>
    </main>
  );
}
