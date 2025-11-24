/**
 * API client for communication with Python backend
 * 
 * Provides methods to interact with the backend services including
 * agent management, pipeline execution, and LLM operations.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
   * Agent operations
   */
  async getAgents() {
    return this.request('/api/agents', { method: 'GET' });
  }

  async testAgent(agentName: string, input: string) {
    return this.request(`/api/agents/${agentName}/test`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
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
    tags?: string[]
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

  async extractKnowledgeGraph(text: string) {
    return this.request('/api/kg/extract', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }
}

export const apiClient = new APIClient();
export default apiClient;

