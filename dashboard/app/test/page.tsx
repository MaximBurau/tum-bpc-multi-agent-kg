"use client";

import QuickTest from "@/components/QuickTest";

/**
 * Quick Test page - Fast sanity checking for agents and flows
 */
export default function TestPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-white">Quick Test</h1>
          <p className="text-sm text-gray-400">
            Instantly test your agents and flows with sample inputs
          </p>
        </div>

        {/* Quick Test Component */}
        <QuickTest />

        {/* Tips */}
        <div className="bg-gray-900/30 border border-gray-800/50 rounded-md p-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Tips
          </h3>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>
              <strong>Agent mode:</strong> Tests a single agent version directly
            </li>
            <li>
              <strong>Flow mode:</strong> Runs the entire multi-step pipeline
            </li>
            <li>
              <strong>Sample texts:</strong> Quick presets for common test cases
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
