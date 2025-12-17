/**
 * API client for communication with Python backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Type definitions for the dynamic agent/flow system

interface SchemaField {
  name: string;
  type: string | { type: string; items?: unknown; fields?: SchemaField[] };
}

interface AgentVersion {
  id: number;
  version: number;
  prompt: string;
  schema_json: SchemaField[];
  model_name: string;
  created_at: string;
}

interface AgentType {
  id: number;
  name: string;
  python_class: string;
  versions: { id: number; version: number; model: string; created_at: string }[];
}

interface Flow {
  id: number;
  name: string;
  yaml_definition?: string;
  created_at: string;
  run_count?: number;
}

interface FlowRun {
  id: number;
  flow_id: number;
  input_text: string;
  output_json?: Record<string, unknown>;
  trace_json?: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed';
  error_message?: string;
  duration_seconds?: number;
  created_at: string;
}

interface FlowRunResult {
  run_id: number;
  output: Record<string, unknown>;
  trace: Record<string, unknown>;
  duration_seconds: number;
}

interface AgentTestResult {
  agent: string;
  output: unknown;
  trace: Record<string, unknown>;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

interface FlowGraph {
  flow_id: number;
  flow_name: string;
  graph_png: string; // base64 encoded PNG from langgraph 
}

interface APIResponse<T> {
  data?: T;
  error?: string;
}

class APIClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  /**
   * Makes a request to the API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Agent operations (legacy)
   */
  async getAgents() {
    return this.request('/api/agents', { method: 'GET' });
  }

  /**
   * Models list
   */
  async getModels(): Promise<APIResponse<{ models: ModelOption[] }>> {
    return this.request('/api/models', { method: 'GET' });
  }

  /**
   * Agent Registry operations
   */
  async getAgentRegistry(): Promise<APIResponse<{ agents: AgentType[] }>> {
    return this.request('/api/agents/registry', { method: 'GET' });
  }

  async createAgentType(name: string): Promise<APIResponse<{ id: number; name: string; python_class: string }>> {
    return this.request('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getAgentVersions(agentName: string): Promise<APIResponse<{ agent_type: string; versions: AgentVersion[] }>> {
    return this.request(`/api/agents/${agentName}/versions`, { method: 'GET' });
  }

  async createAgentVersion(
    agentName: string,
    data: {
      prompt: string;
      schema_json: SchemaField[];
      model_name: string;
    }
  ): Promise<APIResponse<{ id: number; version: number; agent_type: string; created_at: string }>> {
    return this.request(`/api/agents/${agentName}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAgentVersion(
    agentName: string,
    versionNum: number,
    data: {
      prompt?: string;
      schema_json?: SchemaField[];
      model_name?: string;
    }
  ): Promise<APIResponse<{ id: number; version: number; agent_type: string; prompt: string; schema_json: SchemaField[]; model_name: string; updated: boolean }>> {
    return this.request(`/api/agents/${agentName}/versions/${versionNum}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async testAgent(
    agentName: string,
    inputText: string,
    version?: number
  ): Promise<APIResponse<AgentTestResult>> {
    return this.request(`/api/agents/${agentName}/test`, {
      method: 'POST',
      body: JSON.stringify({ input_text: inputText, version }),
    });
  }

  async suggestSchema(
    agentName: string,
    prompt: string,
    description?: string
  ): Promise<APIResponse<{ schema: SchemaField[]; reasoning: string }>> {
    return this.request('/api/suggest-schema', {
      method: 'POST',
      body: JSON.stringify({ agent_name: agentName, prompt, description }),
    });
  }

  /**
   * Flow operations
   */
  async getFlows(): Promise<APIResponse<{ flows: Flow[] }>> {
    return this.request('/api/flows', { method: 'GET' });
  }

  async getFlow(flowId: number): Promise<APIResponse<Flow>> {
    return this.request(`/api/flows/${flowId}`, { method: 'GET' });
  }

  async createFlow(data: { name: string; yaml_definition: string }): Promise<APIResponse<Flow>> {
    return this.request('/api/flows', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFlow(
    flowId: number,
    data: { name?: string; yaml_definition?: string }
  ): Promise<APIResponse<Flow>> {
    return this.request(`/api/flows/${flowId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteFlow(flowId: number): Promise<APIResponse<{ success: boolean }>> {
    return this.request(`/api/flows/${flowId}`, { method: 'DELETE' });
  }

  async runFlow(
    flowId: number,
    inputText: string,
    writeToNeo4j: boolean = true
  ): Promise<APIResponse<FlowRunResult>> {
    return this.request(`/api/flows/${flowId}/run`, {
      method: 'POST',
      body: JSON.stringify({ input_text: inputText, write_to_neo4j: writeToNeo4j }),
    });
  }

  async validateFlow(flowId: number): Promise<APIResponse<{ valid: boolean; errors: string[]; warnings: string[] }>> {
    return this.request(`/api/flows/${flowId}/validate`, { method: 'POST' });
  }

  async getFlowGraph(flowId: number): Promise<APIResponse<FlowGraph>> {
    return this.request(`/api/flows/${flowId}/graph`, { method: 'GET' });
  }

  async getFlowRuns(flowId: number, limit?: number, offset?: number): Promise<APIResponse<{ runs: FlowRun[] }>> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const query = params.toString();
    return this.request(`/api/flows/${flowId}/runs${query ? `?${query}` : ''}`, { method: 'GET' });
  }

  async getFlowRun(runId: number): Promise<APIResponse<FlowRun>> {
    return this.request(`/api/flow-runs/${runId}`, { method: 'GET' });
  }

  async deleteFlowRun(runId: number): Promise<APIResponse<{ success: boolean }>> {
    return this.request(`/api/flow-runs/${runId}`, { method: 'DELETE' });
  }

  /**
   * Pipeline operations
   */
  async runPipeline(
    taskType: string,
    limit?: number,
    prompt?: string,
    systemPrompt?: string,
    model?: string,
    tags?: string[],
    flowId?: number
  ) {
    return this.request('/api/pipeline/run', {
      method: 'POST',
      body: JSON.stringify({
        task_type: taskType,
        limit,
        prompt,
        system_prompt: systemPrompt,
        model,
        tags,
        flow_id: flowId,
      }),
    });
  }

  /**
   * Run history operations
   */
  async getRuns(taskType?: string, limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (taskType) params.append('task_type', taskType);
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    
    const query = params.toString();
    return this.request(`/api/runs${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  }

  async getRunById(runId: number) {
    return this.request(`/api/runs/${runId}`, { method: 'GET' });
  }

  async deleteRun(runId: number) {
    return this.request(`/api/runs/${runId}`, { method: 'DELETE' });
  }

  async getRunStats() {
    return this.request('/api/stats', { method: 'GET' });
  }

  async updateRunTags(runId: number, tags: string[]) {
    return this.request(`/api/runs/${runId}/tags`, {
      method: 'PATCH',
      body: JSON.stringify({ tags }),
    });
  }

  /**
   * LLM operations
   */
  async testLLM(
    prompt: string,
    systemPrompt?: string,
    schema?: string,
    model?: string,
    temperature?: number
  ) {
    return this.request('/api/llm/test', {
      method: 'POST',
      body: JSON.stringify({ 
        prompt, 
        system_prompt: systemPrompt, 
        schema,
        model,
        temperature
      }),
    });
  }

  /**
   * Knowledge graph operations
   */
  async getKnowledgeGraph() {
    return this.request('/api/kg/graph', { method: 'GET' });
  }

  async extractKnowledgeGraph(text: string, systemPrompt?: string) {
    const body: { text: string; system_prompt?: string } = { text };
    if (systemPrompt && systemPrompt.trim()) {
      body.system_prompt = systemPrompt.trim();
    }
    return this.request('/api/kg/extract', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

export const apiClient = new APIClient();
export default apiClient;

// Export types for use in components
export type {
  SchemaField,
  AgentVersion,
  AgentType,
  Flow,
  FlowRun,
  FlowRunResult,
  AgentTestResult,
  ModelOption,
  FlowGraph,
  APIResponse,
};

