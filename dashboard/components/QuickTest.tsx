"use client";

import { useState, useEffect } from "react";
import { apiClient, AgentType, Flow } from "@/lib/api/client";
import StructuredOutput from "./StructuredOutput";

// Sample texts for quick testing
const SAMPLE_TEXTS = [
  {
    name: "Simple sentence",
    text: "Albert Einstein was born in Ulm, Germany in 1879 and later worked at Princeton University.",
  },
  {
    name: "Multiple entities",
    text: "Apple CEO Tim Cook announced the new iPhone at the Steve Jobs Theater in Cupertino, California.",
  },
  {
    name: "Scientific",
    text: "The COVID-19 virus was first identified in Wuhan, China. Dr. Anthony Fauci led the NIAID response in the United States.",
  },
];

interface QuickTestProps {
  defaultAgentName?: string;
  defaultAgentVersion?: number;
  defaultFlowId?: number;
  compact?: boolean;
}

/**
 * QuickTest - One-click testing for agents and flows
 *
 * Features:
 * - Pick an agent or flow from dropdown
 * - Pre-filled sample texts
 * - Instant results with structured output
 */
export default function QuickTest({
  defaultAgentName,
  defaultAgentVersion,
  defaultFlowId,
  compact = false
}: QuickTestProps) {
  const [mode, setMode] = useState<"agent" | "flow">(defaultFlowId ? "flow" : "agent");
  const [agents, setAgents] = useState<AgentType[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selectedAgent, setSelectedAgent] = useState(defaultAgentName || "");
  const [selectedVersion, setSelectedVersion] = useState(defaultAgentVersion || 1);
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(defaultFlowId || null);

  // Input state
  const [inputText, setInputText] = useState(SAMPLE_TEXTS[0].text);
  const [relationLabels, setRelationLabels] = useState(""); // Optional for RE tasks

  // Run state
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [agentsRes, flowsRes] = await Promise.all([
        apiClient.getAgentRegistry(),
        apiClient.getFlows(),
      ]);

      if (agentsRes.data) {
        setAgents(agentsRes.data.agents);
        // Auto-select first agent if none specified
        if (!defaultAgentName && agentsRes.data.agents.length > 0) {
          const first = agentsRes.data.agents[0];
          setSelectedAgent(first.name);
          setSelectedVersion(first.versions[0]?.version || 1);
        }
      }

      if (flowsRes.data) {
        setFlows(flowsRes.data.flows);
        // Auto-select first flow if in flow mode and none specified
        if (defaultFlowId) {
          setSelectedFlowId(defaultFlowId);
        } else if (flowsRes.data.flows.length > 0 && !defaultAgentName) {
          setSelectedFlowId(flowsRes.data.flows[0].id);
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [defaultAgentName, defaultFlowId]);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setDuration(null);

    const startTime = Date.now();

    try {
      if (mode === "agent") {
        const response = await apiClient.testAgent(selectedAgent, inputText, selectedVersion);
        if (response.error) {
          setError(response.error);
        } else if (response.data) {
          setResult(response.data as unknown as Record<string, unknown>);
        }
      } else {
        if (!selectedFlowId) {
          setError("Please select a flow");
          setRunning(false);
          return;
        }
        const response = await apiClient.runFlow(selectedFlowId, inputText, false);
        if (response.error) {
          setError(response.error);
        } else if (response.data) {
          setResult(response.data.output as Record<string, unknown>);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }

    setDuration((Date.now() - startTime) / 1000);
    setRunning(false);
  };

  const selectedAgentData = agents.find(a => a.name === selectedAgent);

  if (loading) {
    return <div className="text-gray-400 text-sm p-4">Loading...</div>;
  }

  return (
    <div className={`bg-gray-900/50 border border-gray-800 rounded-lg ${compact ? "p-3" : "p-4"} space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className={`font-medium text-white ${compact ? "text-sm" : "text-base"}`}>
          Quick Test
        </h3>

        {/* Mode toggle */}
        <div className="flex bg-gray-800 rounded p-0.5">
          <button
            onClick={() => setMode("agent")}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              mode === "agent"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Agent
          </button>
          <button
            onClick={() => setMode("flow")}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              mode === "flow"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Flow
          </button>
        </div>
      </div>

      {/* Selection */}
      <div className="flex gap-2">
        {mode === "agent" ? (
          <>
            <select
              value={selectedAgent}
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                const agent = agents.find(a => a.name === e.target.value);
                if (agent?.versions[0]) {
                  setSelectedVersion(agent.versions[0].version);
                }
              }}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white"
            >
              <option value="">Select agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.name}>
                  {agent.name}
                </option>
              ))}
            </select>

            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(parseInt(e.target.value))}
              disabled={!selectedAgent}
              className="w-24 px-2 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white disabled:opacity-50"
            >
              {selectedAgentData?.versions.map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version}
                </option>
              ))}
            </select>
          </>
        ) : (
          <select
            value={selectedFlowId || ""}
            onChange={(e) => setSelectedFlowId(parseInt(e.target.value) || null)}
            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white"
          >
            <option value="">Select flow...</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Sample text quick picks */}
      <div className="flex gap-1 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Samples:</span>
        {SAMPLE_TEXTS.map((sample, idx) => (
          <button
            key={idx}
            onClick={() => setInputText(sample.text)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              inputText === sample.text
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-gray-300"
            }`}
          >
            {sample.name}
          </button>
        ))}
      </div>

      {/* Input text */}
      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Enter text to test..."
        rows={compact ? 2 : 3}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-none"
      />

      {/* Run button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleRun}
          disabled={running || !inputText.trim() || (mode === "agent" ? !selectedAgent : !selectedFlowId)}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
            running || !inputText.trim()
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-500"
          }`}
        >
          {running ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Test
            </>
          )}
        </button>

        {duration !== null && (
          <span className="text-xs text-gray-500">{duration.toFixed(2)}s</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/30 border border-red-900/50 rounded p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="border-t border-gray-800 pt-4 space-y-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Output</h4>

          {/* Show each key in the result */}
          {Object.entries(result).map(([key, value]) => {
            // Skip internal keys
            if (key.startsWith("_")) return null;

            return (
              <div key={key}>
                <h5 className="text-xs text-gray-500 mb-1">
                  {key.replace(/_/g, " ")}
                  {Array.isArray(value) && <span className="ml-1">({value.length})</span>}
                </h5>
                <StructuredOutput data={value} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
