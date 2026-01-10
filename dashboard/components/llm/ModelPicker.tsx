'use client';

import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { Search, X, ChevronDown } from 'lucide-react';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

interface ModelPickerProps {
  value: string;
  onChange: (modelId: string) => void;
  models: ModelOption[];
}

export default function ModelPicker({ value, onChange, models }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedModel = models.find(m => m.id === value);

  // Close on escape
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Group models by provider
  const groupedModels = models.reduce((acc, model) => {
    const provider = model.provider;
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, ModelOption[]>);

  const providers = Object.keys(groupedModels).sort();

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white text-left flex items-center justify-between hover:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <span className="truncate">
          {selectedModel ? selectedModel.name : 'Select a model...'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Command palette */}
          <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
            <Command
              className="flex flex-col"
              filter={(value, search) => {
                // Custom filter: search in both name and id
                const model = models.find(m => m.id === value);
                if (!model) return 0;
                const searchLower = search.toLowerCase();
                const nameMatch = model.name.toLowerCase().includes(searchLower);
                const idMatch = model.id.toLowerCase().includes(searchLower);
                const providerMatch = model.provider.toLowerCase().includes(searchLower);
                return (nameMatch || idMatch || providerMatch) ? 1 : 0;
              }}
            >
              {/* Search input */}
              <div className="flex items-center px-3 border-b border-gray-700">
                <Search className="w-4 h-4 text-gray-400" />
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search models..."
                  className="flex-1 px-3 py-3 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 hover:bg-gray-800 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Results */}
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-gray-500">
                  No models found.
                </Command.Empty>

                {providers.map(provider => (
                  <Command.Group
                    key={provider}
                    heading={provider}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {groupedModels[provider].map(model => (
                      <Command.Item
                        key={model.id}
                        value={model.id}
                        onSelect={() => {
                          onChange(model.id);
                          setOpen(false);
                          setSearch('');
                        }}
                        className="px-2 py-2 text-sm text-gray-300 rounded cursor-pointer flex items-center justify-between data-[selected=true]:bg-gray-800 hover:bg-gray-800"
                      >
                        <span>{model.name}</span>
                        {model.id === value && (
                          <span className="text-blue-400 text-xs">selected</span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </div>
  );
}
