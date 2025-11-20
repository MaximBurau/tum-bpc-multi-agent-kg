/**
 * Pipeline page - Visual pipeline builder and runner
 * 
 * Allows users to configure agent combinations, build pipelines visually,
 * and run experiments with different configurations.
 */

import PipelineBuilder from "@/components/pipeline/PipelineBuilder";

export default function PipelinePage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] p-8 bg-gray-950">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8 tracking-tight">Pipeline Runner</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <PipelineBuilder />
            <InputArea />
            <ResultsDisplay />
          </div>
          
          <div className="space-y-6">
            <PipelineControls />
            <SavedPipelines />
          </div>
        </div>
      </div>
    </main>
  );
}

function InputArea() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Input Data</h2>
      <textarea
        className="w-full h-32 px-4 py-3 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300 placeholder-gray-600 transition-all duration-200"
        placeholder="Enter text or upload file..."
      />
      <div className="mt-4 flex gap-3">
        <button className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors">
          Upload File
        </button>
      </div>
    </div>
  );
}

function ResultsDisplay() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
      <div className="h-32 flex items-center justify-center border-2 border-dashed border-gray-800 rounded-lg bg-gray-950/30">
        <p className="text-sm text-gray-500">Run pipeline to see results</p>
      </div>
    </div>
  );
}

function PipelineControls() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Controls</h2>
      <div className="space-y-3">
        <button className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20">
          Run Pipeline
        </button>
        <button className="w-full px-4 py-2 bg-gray-800 text-gray-300 font-medium border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors">
          Save Configuration
        </button>
        <button className="w-full px-4 py-2 bg-gray-800 text-gray-300 font-medium border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors">
          Clear
        </button>
      </div>
    </div>
  );
}

function SavedPipelines() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Saved Pipelines</h2>
      <p className="text-sm text-gray-500">No saved pipelines</p>
    </div>
  );
}
