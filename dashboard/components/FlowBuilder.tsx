"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api/client";

// Types
interface SchemaField {
  name: string;
  type: string | { type: string; items?: unknown; fields?: SchemaField[] };
}

interface AgentVersionFull {
  id: number;
  version: number;
  prompt: string;
  schema_json: SchemaField[];
  model_name: string;
  created_at: string;
}

interface AgentVersion {
  id: number;
  version: number;
  model: string;
  created_at: string;
}

interface AgentType {
  id: number;
  name: string;
  python_class: string;
  versions: AgentVersion[];
}

interface StepInput {
  name: string;
  source: string; // e.g., "state.text", "state.entities"
}

interface StepOutput {
  name: string;
  path: string; // e.g., "output.entities"
}

interface FlowStep {
  id: string;
  agent: string; // e.g., "entity_extractor@1"
  agentName: string;
  agentVersion: number;
  inputs: StepInput[];
  outputs: StepOutput[];
}

interface FlowBuilderProps {
  initialYaml?: string;
  onChange: (yaml: string) => void;
  onValidChange?: (isValid: boolean) => void;
}

// Available state fields that can be used as inputs
const INITIAL_STATE_FIELDS = ["text", "relation_labels"];

/**
 * Visual Flow Builder Component - Simplified version
 *
 * Key improvements:
 * - Auto-wiring based on agent prompt variables
 * - Smart output mapping from schema
 * - Clear visual indicators
 */
export default function FlowBuilder({ initialYaml, onChange, onValidChange }: FlowBuilderProps) {
  const [agents, setAgents] = useState<AgentType[]>([]);
  const [agentVersionsCache, setAgentVersionsCache] = useState<Record<string, AgentVersionFull[]>>({});
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load available agents
  useEffect(() => {
    const fetchAgents = async () => {
      const response = await apiClient.getAgentRegistry();
      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        setAgents(response.data.agents);
      }
      setLoading(false);
    };
    fetchAgents();
  }, []);

  // Fetch agent version details
  const fetchAgentVersions = async (agentName: string) => {
    if (agentVersionsCache[agentName]) return agentVersionsCache[agentName];

    const response = await apiClient.getAgentVersions(agentName);
    if (response.data) {
      const versions = response.data.versions as unknown as AgentVersionFull[];
      setAgentVersionsCache(prev => ({ ...prev, [agentName]: versions }));
      return versions;
    }
    return [];
  };

  // Get the full version info for a step
  const getStepVersionInfo = (step: FlowStep): AgentVersionFull | null => {
    const versions = agentVersionsCache[step.agentName];
    if (!versions) return null;
    return versions.find(v => v.version === step.agentVersion) || null;
  };

  // Extract template variables from agent prompt (e.g., {text}, {entities})
  const getAgentInputVariables = (agentName: string, version: number): string[] => {
    const versions = agentVersionsCache[agentName];
    if (!versions) return [];
    const versionInfo = versions.find(v => v.version === version);
    if (!versionInfo?.prompt) return [];

    const matches = versionInfo.prompt.match(/\{(\w+)\}/g) || [];
    return [...new Set(matches.map(m => m.slice(1, -1)))];
  };

  // Get output field names from schema
  const getAgentOutputFields = (agentName: string, version: number): string[] => {
    const versions = agentVersionsCache[agentName];
    if (!versions) return [];
    const versionInfo = versions.find(v => v.version === version);
    if (!versionInfo?.schema_json) return [];

    return versionInfo.schema_json.map(field => field.name);
  };

  // Get available state fields from previous steps
  const getAvailableStateFields = (currentStepIndex: number): string[] => {
    const fields = [...INITIAL_STATE_FIELDS];

    // Add outputs from previous steps
    for (let i = 0; i < currentStepIndex; i++) {
      for (const output of steps[i].outputs) {
        if (output.name) {
          fields.push(output.name);
        }
      }
    }

    return fields;
  };

  // Generate YAML whenever steps change
  const generateYaml = useCallback(() => {
    if (steps.length === 0) return "";

    const yamlLines = ["version: 1", "steps:"];

    for (const step of steps) {
      yamlLines.push(`  - id: ${step.id}`);
      yamlLines.push(`    agent: ${step.agent}`);

      if (step.inputs.length > 0) {
        yamlLines.push("    inputs:");
        for (const input of step.inputs) {
          yamlLines.push(`      ${input.name}: ${input.source}`);
        }
      }

      if (step.outputs.length > 0) {
        yamlLines.push("    outputs:");
        for (const output of step.outputs) {
          yamlLines.push(`      ${output.name}: ${output.path}`);
        }
      }
    }

    return yamlLines.join("\n") + "\n";
  }, [steps]);

  // Update parent when steps change
  useEffect(() => {
    const yaml = generateYaml();
    onChange(yaml);
    onValidChange?.(steps.length > 0 && steps.every(s => s.agentName && s.agent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  // Auto-wire a step based on agent's expected inputs and outputs
  const autoWireStep = async (stepIndex: number, agentName: string, version: number) => {
    // Fetch versions if not cached
    const versions = await fetchAgentVersions(agentName);
    if (!versions || versions.length === 0) return;

    const versionInfo = versions.find(v => v.version === version);
    if (!versionInfo) return;

    // Extract input variables from prompt
    const inputVars: string[] = [];
    if (versionInfo.prompt) {
      const matches = versionInfo.prompt.match(/\{(\w+)\}/g) || [];
      inputVars.push(...[...new Set(matches.map(m => m.slice(1, -1)))]);
    }

    // Get output fields from schema
    const outputFields = versionInfo.schema_json?.map(field => field.name) || [];

    // Use functional update to avoid stale closure
    setSteps(prevSteps => {
      // Get available fields from previous steps
      const availableFields = [...INITIAL_STATE_FIELDS];
      for (let i = 0; i < stepIndex; i++) {
        for (const output of prevSteps[i].outputs) {
          if (output.name) {
            availableFields.push(output.name);
          }
        }
      }

      // Auto-map inputs
      const inputs: StepInput[] = inputVars.map(varName => {
        const matchingField = availableFields.find(f => f === varName || f.endsWith(varName));
        return {
          name: varName,
          source: matchingField ? `state.${matchingField}` : `state.${varName}`,
        };
      });

      // Auto-map outputs
      const outputs: StepOutput[] = outputFields.map(fieldName => ({
        name: fieldName,
        path: `output.${fieldName}`,
      }));

      const newSteps = [...prevSteps];
      newSteps[stepIndex] = {
        ...newSteps[stepIndex],
        inputs,
        outputs,
      };
      return newSteps;
    });
  };

  // Add a new step
  const addStep = () => {
    setSteps(prevSteps => {
      const newId = `step_${prevSteps.length + 1}`;
      const newStep: FlowStep = {
        id: newId,
        agent: "",
        agentName: "",
        agentVersion: 1,
        inputs: [],
        outputs: [],
      };
      return [...prevSteps, newStep];
    });
  };

  // Remove a step
  const removeStep = (index: number) => {
    setSteps(prevSteps => prevSteps.filter((_, i) => i !== index));
  };

  // Update step agent and auto-wire
  const updateStepAgent = async (index: number, agentName: string, version: number) => {
    // First update the agent selection
    setSteps(prevSteps => {
      const newSteps = [...prevSteps];
      newSteps[index] = {
        ...newSteps[index],
        agentName,
        agentVersion: version,
        agent: `${agentName}@${version}`,
      };
      return newSteps;
    });

    // Then auto-wire (this will use functional update too)
    if (agentName) {
      await autoWireStep(index, agentName, version);
    }
  };

  // Update step ID
  const updateStepId = (index: number, id: string) => {
    setSteps(prevSteps => {
      const newSteps = [...prevSteps];
      newSteps[index] = { ...newSteps[index], id };
      return newSteps;
    });
  };

  // Manual input source update
  const updateInputSource = (stepIndex: number, inputIndex: number, source: string) => {
    setSteps(prevSteps => {
      const newSteps = [...prevSteps];
      newSteps[stepIndex] = {
        ...newSteps[stepIndex],
        inputs: newSteps[stepIndex].inputs.map((inp, i) =>
          i === inputIndex ? { ...inp, source } : inp
        ),
      };
      return newSteps;
    });
  };

  // Manual output name update (where to save in state)
  const updateOutputName = (stepIndex: number, outputIndex: number, name: string) => {
    setSteps(prevSteps => {
      const newSteps = [...prevSteps];
      newSteps[stepIndex] = {
        ...newSteps[stepIndex],
        outputs: newSteps[stepIndex].outputs.map((out, i) =>
          i === outputIndex ? { ...out, name } : out
        ),
      };
      return newSteps;
    });
  };

  if (loading) {
    return <div className="text-gray-400 text-sm">Loading agents...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-md p-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, stepIndex) => {
          const versionInfo = getStepVersionInfo(step);
          const availableFields = getAvailableStateFields(stepIndex);

          return (
            <div
              key={stepIndex}
              className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Step header */}
              <div className="px-4 py-3 bg-gray-800/70 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-6 h-6 bg-blue-600 rounded-full text-xs font-bold text-white">
                    {stepIndex + 1}
                  </div>
                  <input
                    type="text"
                    value={step.id}
                    onChange={(e) => updateStepId(stepIndex, e.target.value.replace(/\s/g, "_"))}
                    placeholder="step_id"
                    className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => removeStep(stepIndex)}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                  title="Remove step"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Agent selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Agent</label>
                    <select
                      value={step.agentName}
                      onChange={(e) => {
                        const agent = agents.find(a => a.name === e.target.value);
                        const latestVersion = agent?.versions[0]?.version || 1;
                        updateStepAgent(stepIndex, e.target.value, latestVersion);
                      }}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select agent...</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.name}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Version</label>
                    <select
                      value={step.agentVersion}
                      onChange={(e) => updateStepAgent(stepIndex, step.agentName, parseInt(e.target.value, 10))}
                      disabled={!step.agentName}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {agents
                        .find(a => a.name === step.agentName)
                        ?.versions.map((v) => (
                          <option key={v.id} value={v.version}>
                            v{v.version} ({v.model})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Agent preview */}
                {versionInfo && (
                  <div className="bg-gray-900/50 border border-gray-700/50 rounded p-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                      <span className="px-1.5 py-0.5 bg-gray-800 rounded">{versionInfo.model_name}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {versionInfo.prompt.slice(0, 150)}...
                    </p>
                  </div>
                )}

                {/* Inputs - auto-wired but editable */}
                {step.inputs.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-2">
                      Inputs <span className="text-gray-600">(auto-wired from agent prompt)</span>
                    </label>
                    <div className="space-y-2">
                      {step.inputs.map((input, inputIndex) => (
                        <div key={inputIndex} className="flex items-center gap-2 text-sm">
                          <span className="text-blue-400 font-mono px-2 py-1 bg-blue-900/20 rounded min-w-[80px]">
                            {input.name}
                          </span>
                          <span className="text-gray-600">&larr;</span>
                          <select
                            value={input.source}
                            onChange={(e) => updateInputSource(stepIndex, inputIndex, e.target.value)}
                            className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white"
                          >
                            {availableFields.map((field) => (
                              <option key={field} value={`state.${field}`}>
                                state.{field}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outputs - auto-wired but editable */}
                {step.outputs.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-2">
                      Outputs <span className="text-gray-600">(saves to state for next steps)</span>
                    </label>
                    <div className="space-y-2">
                      {step.outputs.map((output, outputIndex) => (
                        <div key={outputIndex} className="flex items-center gap-2 text-sm">
                          <span className="text-green-400 font-mono px-2 py-1 bg-green-900/20 rounded">
                            {output.path.replace("output.", "")}
                          </span>
                          <span className="text-gray-600">&rarr;</span>
                          <input
                            type="text"
                            value={output.name}
                            onChange={(e) => updateOutputName(stepIndex, outputIndex, e.target.value.replace(/\s/g, "_"))}
                            placeholder="state_key"
                            className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No agent selected state */}
                {!step.agentName && (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    Select an agent to configure inputs and outputs
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add step button */}
      <button
        onClick={addStep}
        className="w-full py-3 border-2 border-dashed border-gray-700 rounded-lg text-sm text-gray-400 hover:border-blue-600 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Step
      </button>

      {/* Summary */}
      {steps.length > 0 && (
        <div className="bg-gray-900/30 border border-gray-800/50 rounded p-3">
          <div className="text-xs text-gray-500">
            <strong className="text-gray-400">Flow:</strong>{" "}
            {steps.map((s, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1">&rarr;</span>}
                <span className="text-gray-300">{s.agentName || "?"}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
