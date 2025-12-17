"use client";

import { useState, useEffect } from "react";

/**
 * Q&A Dataset Explorer - Browse European Union law SQuAD subset
 */

interface QAExample {
  context: string;
  question: string;
  answers: string[];
  id: string;
}

export default function QAExplorer() {
  const [examples, setExamples] = useState<QAExample[]>([]);
  const [selectedExample, setSelectedExample] = useState<QAExample | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDataset();
  }, []);

  const loadDataset = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/data/european_union_law.json");
      if (!response.ok) {
        throw new Error("Failed to load dataset");
      }

      const rawData = await response.json();
      
      // Parse SQuAD format
      const parsed: QAExample[] = [];
      for (const article of rawData.data) {
        for (const paragraph of article.paragraphs) {
          for (const qa of paragraph.qas) {
            parsed.push({
              context: paragraph.context,
              question: qa.question,
              answers: qa.answers.map((a: { text: string }) => a.text),
              id: qa.id,
            });
          }
        }
      }

      setExamples(parsed);
      if (parsed.length > 0) {
        setSelectedExample(parsed[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredExamples = examples.filter(
    (ex) =>
      ex.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.context.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-white">
            Q&A Dataset Explorer
          </h1>
          <p className="text-sm text-gray-400">
            Browse European Union law SQuAD subset ({examples.length} examples)
          </p>
        </div>

        {/* Search */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions or context..."
            className="w-full px-3 py-2 bg-gray-900/50 border border-gray-800 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3">
            <p className="text-sm text-red-400">Error: {error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">Loading dataset...</p>
          </div>
        )}

        {/* Content */}
        {!isLoading && examples.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Questions List */}
            <div className="lg:col-span-1 space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-2">
              {filteredExamples.map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => setSelectedExample(ex)}
                  className={`p-3 rounded border cursor-pointer transition-colors ${
                    selectedExample?.id === ex.id
                      ? "bg-gray-900 border-gray-700"
                      : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <p className="text-xs text-white line-clamp-3">
                    {ex.question}
                  </p>
                  <p className="text-xs text-gray-600 mt-1.5">
                    {ex.answers.length} answer{ex.answers.length !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
              {filteredExamples.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-8">
                  No results found
                </p>
              )}
            </div>

            {/* Detail View */}
            <div className="lg:col-span-2">
              {selectedExample ? (
                <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4 space-y-4">
                  {/* Question */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 mb-2">
                      Question
                    </h3>
                    <p className="text-sm text-white">{selectedExample.question}</p>
                  </div>

                  {/* Answers */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 mb-2">
                      Answers
                    </h3>
                    <div className="space-y-2">
                      {selectedExample.answers.map((answer, idx) => (
                        <div
                          key={idx}
                          className="bg-gray-900 border border-gray-800 rounded p-2"
                        >
                          <p className="text-sm text-white">{answer}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Context */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 mb-2">
                      Context
                    </h3>
                    <div className="bg-gray-900 border border-gray-800 rounded p-3 max-h-96 overflow-y-auto">
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {selectedExample.context}
                      </p>
                    </div>
                  </div>

                  {/* ID */}
                  <div className="text-xs text-gray-600">
                    ID: {selectedExample.id}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900/50 border border-gray-800 rounded-md p-12 text-center">
                  <p className="text-sm text-gray-500">
                    Select a question to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

