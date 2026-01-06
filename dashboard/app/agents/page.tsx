"use client";

import { useState, useEffect } from "react";
import { apiClient, AgentType, AgentVersion, ModelOption, SchemaField } from "@/lib/api/client";
import SchemaEditor from "@/components/SchemaEditor";

/**
 * Agents page - Create and manage agent types and versions
 * Features:
 * - Create new agent types
 * - Create new versions with visual schema editor
 * - Model selection dropdown
 * - View agent details (prompt, schema)
 * - Test agents
 */

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentType[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  
  // Version detail state
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [versionDetails, setVersionDetails] = useState<Record<string, AgentVersion[]>>({});
  
  // Test state
  const [testingAgent, setTestingAgent] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  
  // Create agent type state
  const [showCreateAgentType, setShowCreateAgentType] = useState(false);
  const [newAgentTypeName, setNewAgentTypeName] = useState("");
  const [createTypeLoading, setCreateTypeLoading] = useState(false);
  
  // Rename agent state
  const [renamingAgent, setRenamingAgent] = useState<string | null>(null);
  const [newAgentName, setNewAgentName] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  
  // Create version state
  const [showCreateVersion, setShowCreateVersion] = useState<string | null>(null);
  const [createVersionLoading, setCreateVersionLoading] = useState(false);
  const [newVersion, setNewVersion] = useState({
    prompt: "",
    schema: [] as SchemaField[],
    model: "openai/gpt-4o-mini",
  });

  // Edit version state
  const [editingVersion, setEditingVersion] = useState<{agent: string, version: number} | null>(null);
  const [editVersionLoading, setEditVersionLoading] = useState(false);
  const [editedVersion, setEditedVersion] = useState({
    prompt: "",
    schema: [] as SchemaField[],
    model: "",
  });

  // Schema suggestion state
  const [suggestingSchema, setSuggestingSchema] = useState(false);
  const [schemaReasoning, setSchemaReasoning] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
    fetchModels();
  }, []);

  const fetchAgents = async () => {
    setLoading(true);
    const response = await apiClient.getAgentRegistry();
    if (response.error) {
      setError(response.error);
    } else if (response.data) {
      setAgents(response.data.agents);
    }
    setLoading(false);
  };

  const fetchModels = async () => {
    const response = await apiClient.getModels();
    if (response.data) {
      setModels(response.data.models);
    }
  };

  const fetchVersionDetails = async (agentName: string) => {
    if (versionDetails[agentName]) return;
    
    const response = await apiClient.getAgentVersions(agentName);
    if (response.data) {
      setVersionDetails(prev => ({
        ...prev,
        [agentName]: response.data!.versions
      }));
    }
  };

  const handleCreateAgentType = async () => {
    if (!newAgentTypeName.trim()) return;
    
    setCreateTypeLoading(true);
    const response = await apiClient.createAgentType(newAgentTypeName.trim());
    if (response.error) {
      setError(response.error);
    } else {
      setShowCreateAgentType(false);
      setNewAgentTypeName("");
      fetchAgents();
    }
    setCreateTypeLoading(false);
  };

  const handleRenameAgent = async (oldName: string) => {
    if (!newAgentName.trim() || newAgentName.trim() === oldName) {
      setRenamingAgent(null);
      setNewAgentName("");
      return;
    }
    
    setRenameLoading(true);
    const response = await apiClient.renameAgentType(oldName, newAgentName.trim());
    if (response.error) {
      setError(response.error);
    } else {
      setRenamingAgent(null);
      setNewAgentName("");
      fetchAgents();
    }
    setRenameLoading(false);
  };

  const handleCreateVersion = async (agentName: string) => {
    if (!newVersion.prompt.trim()) {
      setError("Prompt is required");
      return;
    }
    
    setCreateVersionLoading(true);
    try {
      const response = await apiClient.createAgentVersion(agentName, {
        prompt: newVersion.prompt,
        schema_json: newVersion.schema,
        model_name: newVersion.model,
      });
      
      if (response.error) {
        setError(response.error);
      } else {
        setShowCreateVersion(null);
        setNewVersion({ prompt: "", schema: [], model: "openai/gpt-4o-mini" });
        // Clear cached details
        setVersionDetails(prev => {
          const copy = {...prev};
          delete copy[agentName];
          return copy;
        });
        fetchAgents();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create version");
    }
    setCreateVersionLoading(false);
  };

  const handleTest = async (agentName: string, version: number) => {
    if (!testInput.trim()) return;
    
    setTestLoading(true);
    setTestResult(null);
    
    const response = await apiClient.testAgent(agentName, testInput, version);
    if (response.error) {
      setTestResult({ error: response.error });
    } else if (response.data) {
      setTestResult(response.data as unknown as Record<string, unknown>);
    }
    setTestLoading(false);
  };

  const startEditVersion = (agentName: string, version: AgentVersion) => {
    setEditingVersion({ agent: agentName, version: version.version });
    setEditedVersion({
      prompt: version.prompt,
      schema: version.schema_json,
      model: version.model_name,
    });
  };

  const cancelEditVersion = () => {
    setEditingVersion(null);
    setEditedVersion({ prompt: "", schema: [], model: "" });
  };

  const handleSaveVersion = async () => {
    if (!editingVersion) return;
    
    setEditVersionLoading(true);
    try {
      const response = await apiClient.updateAgentVersion(
        editingVersion.agent,
        editingVersion.version,
        {
          prompt: editedVersion.prompt,
          schema_json: editedVersion.schema,
          model_name: editedVersion.model,
        }
      );
      
      if (response.error) {
        setError(response.error);
      } else {
        // Clear cached details to refetch
        setVersionDetails(prev => {
          const copy = {...prev};
          delete copy[editingVersion.agent];
          return copy;
        });
        setEditingVersion(null);
        setEditedVersion({ prompt: "", schema: [], model: "" });
        fetchAgents();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save version");
    }
    setEditVersionLoading(false);
  };

  const handleSuggestSchema = async (agentName: string, prompt: string, isEdit: boolean) => {
    if (!prompt.trim()) {
      setError("Enter a prompt first to suggest a schema");
      return;
    }
    
    setSuggestingSchema(true);
    setSchemaReasoning(null);
    
    try {
      const response = await apiClient.suggestSchema(agentName, prompt);
      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        if (isEdit) {
          setEditedVersion(prev => ({ ...prev, schema: response.data!.schema }));
        } else {
          setNewVersion(prev => ({ ...prev, schema: response.data!.schema }));
        }
        setSchemaReasoning(response.data.reasoning);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to suggest schema");
    }
    setSuggestingSchema(false);
  };

  const handleVersionClick = async (agentName: string, versionId: number) => {
    if (selectedVersionId === versionId) {
      setSelectedVersionId(null);
    } else {
      setSelectedVersionId(versionId);
      await fetchVersionDetails(agentName);
    }
  };

  const getVersionDetail = (agentName: string, versionNum: number): AgentVersion | undefined => {
    return versionDetails[agentName]?.find(v => v.version === versionNum);
  };

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-gray-400">Loading agents...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Agents</h1>
            <p className="text-sm text-gray-400 mt-1">
              Create and manage agent types and their versions
            </p>
          </div>
          <button
            onClick={() => setShowCreateAgentType(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-500 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Agent Type
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3 flex justify-between items-center">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* Create Agent Type Modal */}
        {showCreateAgentType && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-white mb-4">Create New Agent Type</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={newAgentTypeName}
                    onChange={(e) => setNewAgentTypeName(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                    placeholder="e.g., summarizer, qa_agent"
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Use lowercase with underscores</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowCreateAgentType(false); setNewAgentTypeName(""); }}
                    className="px-4 py-2 text-gray-400 hover:text-white text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAgentType}
                    disabled={createTypeLoading || !newAgentTypeName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
                  >
                    {createTypeLoading ? "Creating..." : "Create Agent Type"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agent Cards */}
        <div className="space-y-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden"
            >
              {/* Agent Header */}
              <div className="w-full px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-sm font-bold text-white">
                      {agent.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  {renamingAgent === agent.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={newAgentName}
                        onChange={(e) => setNewAgentName(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleRenameAgent(agent.name);
                          } else if (e.key === "Escape") {
                            setRenamingAgent(null);
                            setNewAgentName("");
                          }
                        }}
                        autoFocus
                        className="flex-1 px-2 py-1 bg-gray-950 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => handleRenameAgent(agent.name)}
                        disabled={renameLoading || !newAgentName.trim() || newAgentName.trim() === agent.name}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50"
                      >
                        {renameLoading ? "..." : "Save"}
                      </button>
                      <button
                        onClick={() => { setRenamingAgent(null); setNewAgentName(""); }}
                        className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="text-left flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-white">{agent.name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingAgent(agent.name);
                            setNewAgentName(agent.name);
                          }}
                          className="text-xs text-gray-500 hover:text-gray-400"
                          title="Rename agent"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">
                        {agent.versions.length} version{agent.versions.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setExpandedAgent(expandedAgent === agent.name ? null : agent.name)}
                  className="ml-2"
                >
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${expandedAgent === agent.name ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Expanded Content */}
              {expandedAgent === agent.name && (
                <div className="border-t border-gray-800 p-4 space-y-4">
                  {/* Create New Version Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowCreateVersion(showCreateVersion === agent.name ? null : agent.name)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-500 flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New Version
                    </button>
                  </div>

                  {/* Create Version Form */}
                  {showCreateVersion === agent.name && (
                    <div className="bg-gray-950 border border-gray-700 rounded-lg p-4 space-y-4">
                      <h4 className="text-sm font-medium text-white">Create New Version</h4>
                      
                      {/* Prompt */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Prompt Template</label>
                        <textarea
                          value={newVersion.prompt}
                          onChange={(e) => setNewVersion({...newVersion, prompt: e.target.value})}
                          placeholder="Enter prompt with {text} and other placeholders..."
                          rows={5}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">Use {"{text}"} for input text, {"{entities}"} for entities list, etc.</p>
                      </div>

                      {/* Model Selection */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Model</label>
                        <select
                          value={newVersion.model}
                          onChange={(e) => setNewVersion({...newVersion, model: e.target.value})}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name} ({model.provider})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Schema Editor */}
                      <div className="border border-gray-700 rounded-lg p-3 bg-gray-900/50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Output Schema</span>
                          <button
                            onClick={() => handleSuggestSchema(agent.name, newVersion.prompt, false)}
                            disabled={suggestingSchema || !newVersion.prompt.trim()}
                            className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-500 disabled:opacity-50 flex items-center gap-1"
                          >
                            {suggestingSchema ? (
                              <>
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Suggesting...
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Auto-Suggest
                              </>
                            )}
                          </button>
                        </div>
                        {schemaReasoning && showCreateVersion === agent.name && (
                          <div className="mb-3 p-2 bg-purple-900/20 border border-purple-800/50 rounded text-xs text-purple-300">
                            💡 {schemaReasoning}
                          </div>
                        )}
                        <SchemaEditor
                          value={newVersion.schema}
                          onChange={(schema) => setNewVersion({...newVersion, schema})}
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCreateVersion(agent.name)}
                          disabled={createVersionLoading || !newVersion.prompt.trim()}
                          className="px-4 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50"
                        >
                          {createVersionLoading ? "Creating..." : "Create Version"}
                        </button>
                        <button
                          onClick={() => { setShowCreateVersion(null); setNewVersion({ prompt: "", schema: [], model: "openai/gpt-4o-mini" }); setSchemaReasoning(null); }}
                          className="px-4 py-2 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Versions List */}
                  {agent.versions.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 text-sm">
                      No versions yet. Create your first version above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {agent.versions.map((version) => {
                        const detail = getVersionDetail(agent.name, version.version);
                        const isExpanded = selectedVersionId === version.id;
                        
                        return (
                          <div key={version.id} className="bg-gray-900/50 border border-gray-800 rounded overflow-hidden">
                            {/* Version Header */}
                            <div 
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-800/30"
                              onClick={() => handleVersionClick(agent.name, version.id)}
                            >
                              <div className="flex items-center gap-4">
                                <span className="text-sm font-medium text-white bg-gray-800 px-2 py-0.5 rounded">
                                  v{version.version}
                                </span>
                                <span className="text-xs text-gray-400">{version.model}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">
                                  {new Date(version.created_at).toLocaleDateString()}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTestingAgent(`${agent.name}@${version.version}`);
                                  }}
                                  className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded"
                                >
                                  Test
                                </button>
                                <svg
                                  className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </div>

                            {/* Version Details */}
                            {isExpanded && (
                              <div className="border-t border-gray-800 p-4 space-y-4">
                                {detail ? (
                                  editingVersion?.agent === agent.name && editingVersion?.version === version.version ? (
                                    // Edit Mode
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium text-white">Edit Version {version.version}</h4>
                                      </div>
                                      
                                      {/* Prompt */}
                                      <div>
                                        <label className="block text-xs text-gray-400 mb-1">Prompt Template</label>
                                        <textarea
                                          value={editedVersion.prompt}
                                          onChange={(e) => setEditedVersion({...editedVersion, prompt: e.target.value})}
                                          rows={5}
                                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                      </div>

                                      {/* Model */}
                                      <div>
                                        <label className="block text-xs text-gray-400 mb-1">Model</label>
                                        <select
                                          value={editedVersion.model}
                                          onChange={(e) => setEditedVersion({...editedVersion, model: e.target.value})}
                                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        >
                                          {models.map((m) => (
                                            <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Schema */}
                                      <div className="border border-gray-700 rounded-lg p-3 bg-gray-900/50">
                                        <div className="flex items-center justify-between mb-3">
                                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Output Schema</span>
                                          <button
                                            onClick={() => handleSuggestSchema(agent.name, editedVersion.prompt, true)}
                                            disabled={suggestingSchema || !editedVersion.prompt.trim()}
                                            className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-500 disabled:opacity-50 flex items-center gap-1"
                                          >
                                            {suggestingSchema ? "Suggesting..." : "Auto-Suggest"}
                                          </button>
                                        </div>
                                        {schemaReasoning && editingVersion?.agent === agent.name && (
                                          <div className="mb-3 p-2 bg-purple-900/20 border border-purple-800/50 rounded text-xs text-purple-300">
                                            💡 {schemaReasoning}
                                          </div>
                                        )}
                                        <SchemaEditor
                                          value={editedVersion.schema}
                                          onChange={(schema) => setEditedVersion({...editedVersion, schema})}
                                        />
                                      </div>

                                      {/* Actions */}
                                      <div className="flex gap-2">
                                        <button
                                          onClick={handleSaveVersion}
                                          disabled={editVersionLoading}
                                          className="px-4 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50"
                                        >
                                          {editVersionLoading ? "Saving..." : "Save Changes"}
                                        </button>
                                        <button
                                          onClick={() => { cancelEditVersion(); setSchemaReasoning(null); }}
                                          className="px-4 py-2 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-700"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    // View Mode
                                    <>
                                      <div className="flex justify-end">
                                        <button
                                          onClick={() => startEditVersion(agent.name, detail)}
                                          className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/30 rounded flex items-center gap-1"
                                        >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                          Edit
                                        </button>
                                      </div>
                                      <div>
                                        <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                                          Prompt Template
                                        </h5>
                                        <pre className="p-3 bg-gray-950 border border-gray-800 rounded text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
                                          {detail.prompt}
                                        </pre>
                                      </div>
                                      <div>
                                        <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                                          Output Schema
                                        </h5>
                                        <pre className="p-3 bg-gray-950 border border-gray-800 rounded text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
                                          {JSON.stringify(detail.schema_json, null, 2)}
                                        </pre>
                                      </div>
                                    </>
                                  )
                                ) : (
                                  <div className="text-xs text-gray-500">Loading details...</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Test Panel */}
                  {testingAgent?.startsWith(agent.name) && (
                    <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">
                          Test {testingAgent}
                        </span>
                        <button
                          onClick={() => { setTestingAgent(null); setTestResult(null); }}
                          className="text-xs text-gray-500 hover:text-gray-400"
                        >
                          Close
                        </button>
                      </div>
                      <textarea
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        placeholder="Enter test text..."
                        rows={3}
                        className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-none"
                      />
                      <button
                        onClick={() => {
                          const [name, ver] = testingAgent.split("@");
                          handleTest(name, parseInt(ver));
                        }}
                        disabled={testLoading || !testInput.trim()}
                        className="px-4 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50"
                      >
                        {testLoading ? "Running..." : "Run Test"}
                      </button>

                      {testResult && (
                        <div className="p-3 bg-gray-950 rounded border border-gray-700">
                          <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(testResult, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {agents.length === 0 && !error && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500">No agents found.</p>
              <p className="text-sm text-gray-600 mt-1">Create your first agent type to get started.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

