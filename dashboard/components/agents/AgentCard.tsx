/**
 * AgentCard component
 * 
 * Displays information about an individual agent with configuration and testing options.
 */

import { Settings, Play } from 'lucide-react';

interface AgentCardProps {
  name: string;
  description: string;
  status: 'active' | 'inactive';
  onConfigure?: () => void;
  onTest?: () => void;
}

export default function AgentCard({ 
  name, 
  description, 
  status,
  onConfigure,
  onTest 
}: AgentCardProps) {
  const statusStyles = status === 'active' 
    ? 'bg-green-500/10 text-green-400 border-green-500/20' 
    : 'bg-gray-800 text-gray-400 border-gray-700';
  
  return (
    <div className="group bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800 hover:border-gray-700 transition-all duration-300">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-white">{name}</h3>
        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${statusStyles}`}>
          {status}
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-6 min-h-[40px]">{description}</p>
      <div className="flex gap-3">
        <button 
          onClick={onConfigure}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Settings className="w-4 h-4" />
          Configure
        </button>
        <button 
          onClick={onTest}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-gray-800 text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
        >
          <Play className="w-4 h-4" />
          Test
        </button>
      </div>
    </div>
  );
}
