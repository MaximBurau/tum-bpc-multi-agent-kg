/**
 * PipelineBuilder component
 * 
 * Visual interface for building agent pipelines by selecting and ordering agents.
 */

'use client';

export default function PipelineBuilder() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Pipeline Configuration</h2>
      <div className="space-y-4">
        <div className="p-4 border border-blue-900/30 rounded-lg bg-blue-900/10 text-blue-200">
          <p className="text-sm">
            Select agents to build your pipeline. Agents will be executed in order.
          </p>
        </div>
        <div className="min-h-48 border-2 border-dashed border-gray-700 rounded-lg bg-gray-950/30 flex items-center justify-center p-6 hover:border-gray-600 transition-colors cursor-pointer">
          <div className="text-center">
            <p className="text-sm text-gray-400 font-medium">
              Drag agents here to build pipeline
            </p>
            <p className="text-xs text-gray-600 mt-1">
              or click to browse available agents
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
