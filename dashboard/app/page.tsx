/**
 * Home page - Dashboard overview
 * 
 * Displays quick stats, recent activity, and provides quick access to main features.
 */

import { ArrowRight, Database, Share2, Bot, Activity, Play } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-4rem)] p-8 bg-gray-950">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-gray-400">
            Monitor and control your multi-agent knowledge graph system
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Total Entities"
            value="0"
            description="Extracted entities"
            icon={<Database className="w-5 h-5 text-blue-400" />}
            trend="+0% this week"
          />
          <StatCard
            title="Total Relations"
            value="0"
            description="Connected triples"
            icon={<Share2 className="w-5 h-5 text-purple-400" />}
            trend="+0% this week"
          />
          <StatCard
            title="Active Agents"
            value="6"
            description="System agents"
            icon={<Bot className="w-5 h-5 text-green-400" />}
            trend="All systems operational"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <QuickActions />
          </div>
          <div>
            <RecentActivity />
          </div>
        </div>
      </div>
    </main>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  trend: string;
}

function StatCard({ title, value, description, icon, trend }: StatCardProps) {
  return (
    <div className="group bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800 hover:border-gray-700 transition-all duration-300">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-gray-800/50 rounded-lg group-hover:bg-gray-800 transition-colors">
          {icon}
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-800/50 px-2 py-1 rounded-full">
          Live
        </span>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-gray-400">{title}</h3>
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-800">
        <span className="text-xs text-gray-500">{trend}</span>
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800 h-full">
      <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
        <Play className="w-5 h-5 text-blue-500" />
        Quick Actions
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ActionButton 
          href="/pipeline" 
          label="Run Pipeline" 
          description="Start a new extraction pipeline"
          color="blue"
        />
        <ActionButton 
          href="/agents" 
          label="Manage Agents" 
          description="Configure agent parameters"
          color="purple"
        />
        <ActionButton 
          href="/kg-viz" 
          label="View Graph" 
          description="Explore knowledge graph"
          color="green"
        />
        <ActionButton 
          href="/llm" 
          label="LLM Playground" 
          description="Test prompts & schemas"
          color="orange"
        />
      </div>
    </div>
  );
}

function ActionButton({ href, label, description, color }: { href: string; label: string; description: string; color: string }) {
  const colorClasses = {
    blue: 'hover:border-blue-500/50 hover:bg-blue-500/5',
    purple: 'hover:border-purple-500/50 hover:bg-purple-500/5',
    green: 'hover:border-green-500/50 hover:bg-green-500/5',
    orange: 'hover:border-orange-500/50 hover:bg-orange-500/5',
  }[color];

  return (
    <a
      href={href}
      className={`group block p-4 rounded-lg border border-gray-800 bg-gray-900 transition-all duration-300 ${colorClasses}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-200 group-hover:text-white transition-colors">{label}</span>
        <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-transform group-hover:translate-x-1" />
      </div>
      <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors">{description}</p>
    </a>
  );
}

function RecentActivity() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800 h-full">
      <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
        <Activity className="w-5 h-5 text-green-500" />
        Recent Activity
      </h2>
      <div className="space-y-4">
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm bg-gray-900/50 rounded-lg border border-gray-800 border-dashed">
          No recent activity
        </div>
      </div>
    </div>
  );
}
