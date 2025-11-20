/**
 * Knowledge Graph Visualization page
 * 
 * Provides interactive visualization of the knowledge graph with filtering,
 * search, and exploration capabilities.
 */

import GraphViewer from "@/components/kg-viz/GraphViewer";

export default function KGVisualizationPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] p-8 bg-gray-950">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8 tracking-tight">Knowledge Graph</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <GraphViewer />
          </div>
          
          <div className="space-y-6">
            <GraphControls />
            <GraphStats />
          </div>
        </div>
      </div>
    </main>
  );
}

function GraphControls() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Controls</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Search
          </label>
          <input
            type="text"
            placeholder="Search entities..."
            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300 placeholder-gray-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Filter by Type
          </label>
          <select className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300">
            <option>All Types</option>
            <option>Person</option>
            <option>Organization</option>
            <option>Location</option>
          </select>
        </div>
        <button className="w-full px-4 py-2 bg-gray-800 text-gray-300 font-medium border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors">
          Reset View
        </button>
      </div>
    </div>
  );
}

function GraphStats() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Statistics</h2>
      <div className="space-y-3">
        <StatItem label="Nodes" value="0" />
        <StatItem label="Edges" value="0" />
        <StatItem label="Node Types" value="0" />
        <StatItem label="Edge Types" value="0" />
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}
