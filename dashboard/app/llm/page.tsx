/**
 * LLM Playground page
 * 
 * Interactive environment for testing prompts, Pydantic schemas,
 * and experimenting with different LLM configurations.
 */

'use client';

import { useState } from 'react';
import apiClient from '@/lib/api/client';

export default function LLMPlaygroundPage() {
  const [model, setModel] = useState('openai/gpt-4o');
  const [schema, setSchema] = useState('None');
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRun = async () => {
    if (!userPrompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsLoading(true);
    setError('');
    setOutput('');

    try {
      const response = await apiClient.testLLM(
        userPrompt,
        systemPrompt || undefined,
        schema !== 'None' ? schema : undefined,
        model,
        temperature
      );

      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        setOutput(
          response.data.is_structured
            ? JSON.stringify(response.data.output, null, 2)
            : response.data.output
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run LLM');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] p-8 bg-gray-950">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8 tracking-tight">LLM Playground</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <ConfigurationPanel
              model={model}
              setModel={setModel}
              schema={schema}
              setSchema={setSchema}
              temperature={temperature}
              setTemperature={setTemperature}
            />
            <PromptEditor
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
              userPrompt={userPrompt}
              setUserPrompt={setUserPrompt}
              onRun={handleRun}
              isLoading={isLoading}
            />
          </div>
          
          <div className="space-y-6">
            <OutputViewer output={output} error={error} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </main>
  );
}

interface ConfigurationPanelProps {
  model: string;
  setModel: (model: string) => void;
  schema: string;
  setSchema: (schema: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
}

function ConfigurationPanel({ model, setModel, schema, setSchema, temperature, setTemperature }: ConfigurationPanelProps) {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Configuration</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Model
          </label>
          <select 
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300"
          >
            <option value="openai/gpt-4o">OpenAI GPT-4o</option>
            <option value="openai/gpt-4">OpenAI GPT-4</option>
            <option value="anthropic/claude-3-opus">Claude 3 Opus</option>
            <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet</option>
            <option value="qwen/qwen-2.5-72b-instruct">Qwen 2.5 72B (Cheap)</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Response Type
          </label>
          <select 
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300"
          >
            <option value="None">Unstructured Text</option>
            <option value="Entity">Entity (Structured)</option>
            <option value="Relation">Relation (Structured)</option>
            <option value="EntityList">Entity List (Structured)</option>
            <option value="RelationList">Relation List (Structured)</option>
            <option value="KnowledgeGraphExtraction">Full KG Extraction (Structured)</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Temperature: {temperature}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.0 (Precise)</span>
            <span>1.0 (Creative)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PromptEditorProps {
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  userPrompt: string;
  setUserPrompt: (prompt: string) => void;
  onRun: () => void;
  isLoading: boolean;
}

function PromptEditor({ systemPrompt, setSystemPrompt, userPrompt, setUserPrompt, onRun, isLoading }: PromptEditorProps) {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Prompt</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            System Prompt (Optional)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full h-24 px-4 py-3 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300 placeholder-gray-600 font-mono text-sm transition-all duration-200"
            placeholder="Enter system prompt..."
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            User Prompt
          </label>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            className="w-full h-32 px-4 py-3 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300 placeholder-gray-600 font-mono text-sm transition-all duration-200"
            placeholder="Enter your prompt..."
          />
        </div>
        
        <button 
          onClick={onRun}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Running...' : 'Run'}
        </button>
      </div>
    </div>
  );
}

interface OutputViewerProps {
  output: string;
  error: string;
  isLoading: boolean;
}

function OutputViewer({ output, error, isLoading }: OutputViewerProps) {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800 h-full flex flex-col">
      <h2 className="text-lg font-semibold text-white mb-4">Output</h2>
      <div className="flex-1 p-4 bg-gray-950 rounded-lg border border-gray-800 font-mono text-sm text-gray-300 overflow-auto min-h-[500px]">
        {isLoading ? (
          <div className="flex items-center gap-2 text-blue-400">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            Processing...
          </div>
        ) : error ? (
          <div className="text-red-400">{error}</div>
        ) : output ? (
          <pre className="whitespace-pre-wrap">{output}</pre>
        ) : (
          <p className="text-gray-500">Run a prompt to see output</p>
        )}
      </div>
    </div>
  );
}
