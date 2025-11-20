/**
 * PromptEditor component
 * 
 * Text editor interface for crafting and submitting prompts to the LLM.
 */

'use client';

interface PromptEditorProps {
  onSubmit?: (systemPrompt: string, userPrompt: string) => void;
}

export default function PromptEditor({ onSubmit }: PromptEditorProps) {
  const handleSubmit = () => {
    const systemPrompt = (document.getElementById('system-prompt') as HTMLTextAreaElement)?.value || '';
    const userPrompt = (document.getElementById('user-prompt') as HTMLTextAreaElement)?.value || '';
    onSubmit?.(systemPrompt, userPrompt);
  };

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Prompt</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="system-prompt" className="block text-sm font-medium text-gray-400 mb-2">
            System Prompt (Optional)
          </label>
          <textarea
            id="system-prompt"
            className="w-full h-24 px-4 py-3 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300 placeholder-gray-600 font-mono text-sm transition-all duration-200"
            placeholder="Enter system prompt..."
          />
        </div>
        
        <div>
          <label htmlFor="user-prompt" className="block text-sm font-medium text-gray-400 mb-2">
            User Prompt
          </label>
          <textarea
            id="user-prompt"
            className="w-full h-32 px-4 py-3 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-gray-300 placeholder-gray-600 font-mono text-sm transition-all duration-200"
            placeholder="Enter your prompt..."
          />
        </div>
        
        <button 
          onClick={handleSubmit}
          className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
        >
          Run
        </button>
      </div>
    </div>
  );
}
