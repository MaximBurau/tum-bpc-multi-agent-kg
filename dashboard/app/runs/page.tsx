"use client";

import { useState, useEffect } from "react";
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
  outputs: Record<string, unknown> | null;
}

export default function RunsHistory() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
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
      if (selectedRun?.id === runId) {
        setSelectedRun(null);
      }
    } catch (err) {
      alert("Failed to delete run");
    }
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
    const allMetrics = new Set<string>();
    runs.forEach(run => {
      Object.keys(run.metrics).forEach(key => allMetrics.add(key));
    });
    return Array.from(allMetrics);
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
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">ID</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Task</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Model</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Date</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Duration</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Examples</th>
                    {metricColumns.map(metric => (
                      <th key={metric} className="text-left px-4 py-2 text-xs font-medium text-gray-400">
                        {metric.replace(/_/g, " ")}
                      </th>
                    ))}
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Tags</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className={`border-b border-gray-800 hover:bg-gray-900/50 cursor-pointer transition-colors ${
                        selectedRun?.id === run.id ? "bg-gray-900/70" : ""
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
                      {metricColumns.map(metric => (
                        <td key={metric} className="px-4 py-2 text-gray-300 text-xs font-mono">
                          {run.metrics[metric] !== undefined
                            ? typeof run.metrics[metric] === "number"
                              ? run.metrics[metric].toFixed(4)
                              : run.metrics[metric]
                            : "-"}
                        </td>
                      ))}
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
                  ))}
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

        {/* Detail Panel */}
        {selectedRun && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-300">
                Run #{selectedRun.id} Details
              </h2>
              <button
                onClick={() => setSelectedRun(null)}
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
                    <span className="text-gray-300 uppercase">{selectedRun.task_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Model:</span>
                    <span className="text-gray-300">{selectedRun.model || "Default"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Examples:</span>
                    <span className="text-gray-300">{selectedRun.num_examples}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Duration:</span>
                    <span className="text-gray-300">{selectedRun.duration_seconds.toFixed(2)}s</span>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-gray-400">Metrics</h3>
                <div className="space-y-2 text-xs">
                  {Object.entries(selectedRun.metrics).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-500 capitalize">{key.replace(/_/g, " ")}:</span>
                      <span className="text-gray-300 font-mono">
                        {typeof value === "number" ? value.toFixed(4) : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Prompts */}
            {(selectedRun.system_prompt || selectedRun.prompt) && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-gray-400">Prompts</h3>
                {selectedRun.system_prompt && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">System Prompt:</p>
                    <pre className="bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-300 overflow-x-auto">
                      {selectedRun.system_prompt}
                    </pre>
                  </div>
                )}
                {selectedRun.prompt && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Prompt:</p>
                    <pre className="bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-300 overflow-x-auto">
                      {selectedRun.prompt}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Outputs */}
            {selectedRun.outputs && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-gray-400">Outputs</h3>
                <pre className="bg-gray-900 border border-gray-800 rounded p-3 text-xs text-gray-300 overflow-x-auto max-h-96">
                  {JSON.stringify(selectedRun.outputs, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
