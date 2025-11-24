"use client";

import { useState, useEffect, useRef } from "react";
import { apiClient } from "@/lib/api/client";
import dynamic from "next/dynamic";

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/**
 * LLM Playground - Extract knowledge graphs and visualize
 */

interface Triple {
  subject: string;
  predicate: string;
  object: string;
  subject_type?: string;
  object_type?: string;
}

interface Entity {
  name: string;
  type: string;
  description?: string;
}

interface ExtractionResult {
  entities: Entity[];
  triples: Triple[];
}

interface GraphNode {
  id: string;
  name: string;
  type?: string;
  val?: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export default function Playground() {
  const [inputText, setInputText] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a knowledge graph extraction model. Extract entities and relationships from the given text."
  );
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [error, setError] = useState<string | null>(null);
  const graphRef = useRef<any>();

  const handleExtract = async () => {
    if (!inputText.trim()) {
      setError("Please enter some text to extract from");
      return;
    }

    setIsExtracting(true);
    setError(null);
    setExtractionResult(null);

    try {
      const response = await apiClient.extractKnowledgeGraph(inputText);

      if (response.error) {
        setError(response.error);
      } else {
        const result = response.data as ExtractionResult;
        setExtractionResult(result);
        
        // Convert to graph format
        const nodes: GraphNode[] = [];
        const links: GraphLink[] = [];
        const nodeSet = new Set<string>();

        // Add nodes from triples
        result.triples.forEach((triple) => {
          if (!nodeSet.has(triple.subject)) {
            nodes.push({
              id: triple.subject,
              name: triple.subject,
              type: triple.subject_type,
              val: 10,
            });
            nodeSet.add(triple.subject);
          }
          if (!nodeSet.has(triple.object)) {
            nodes.push({
              id: triple.object,
              name: triple.object,
              type: triple.object_type,
              val: 10,
            });
            nodeSet.add(triple.object);
          }

          links.push({
            source: triple.subject,
            target: triple.object,
            label: triple.predicate,
          });
        });

        setGraphData({ nodes, links });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 bg-gray-950">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-white">
            Knowledge Graph Playground
          </h1>
          <p className="text-sm text-gray-400">
            Extract entities and relationships from text
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-md p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Main Layout: Input (Left) + Results (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input Section */}
          <div className="space-y-4">
            <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4 space-y-4">
              <h2 className="text-sm font-medium text-gray-300">Configuration</h2>

              {/* System Prompt */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">
                  System Prompt
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-600 font-mono resize-none"
                />
              </div>

              {/* Input Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">
                  Text to Extract From
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={12}
                  placeholder="Enter text to extract knowledge graph from..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600 resize-none"
                />
              </div>

              {/* Extract Button */}
              <button
                onClick={handleExtract}
                disabled={isExtracting}
                className={`w-full py-2 rounded text-sm font-medium transition-colors ${
                  isExtracting
                    ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                    : "bg-gray-700 text-white hover:bg-gray-600"
                }`}
              >
                {isExtracting ? "Extracting..." : "Extract Knowledge Graph"}
              </button>
            </div>
          </div>

          {/* Right: Extraction Results */}
          <div className="space-y-4">
            {extractionResult ? (
              <>
                {/* Entities */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4">
                  <h2 className="text-sm font-medium text-gray-300 mb-3">
                    Entities ({extractionResult.entities.length})
                  </h2>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {extractionResult.entities.map((entity, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-900 border border-gray-800 rounded p-2 flex items-center justify-between"
                      >
                        <span className="text-sm text-white">{entity.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                          {entity.type}
                        </span>
                      </div>
                    ))}
                    {extractionResult.entities.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No entities extracted
                      </p>
                    )}
                  </div>
                </div>

                {/* Triples */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4">
                  <h2 className="text-sm font-medium text-gray-300 mb-3">
                    Triples ({extractionResult.triples.length})
                  </h2>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {extractionResult.triples.map((triple, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-900 border border-gray-800 rounded p-2"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-300 font-medium">
                            {triple.subject}
                          </span>
                          <span className="text-gray-600">→</span>
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                            {triple.predicate}
                          </span>
                          <span className="text-gray-600">→</span>
                          <span className="text-gray-300 font-medium">
                            {triple.object}
                          </span>
                        </div>
                      </div>
                    ))}
                    {extractionResult.triples.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No triples extracted
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-gray-900/50 border border-gray-800 rounded-md p-12 text-center">
                <p className="text-sm text-gray-500">
                  Extract a knowledge graph to see results
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Graph Visualization */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-md p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">
              Knowledge Graph Visualization ({graphData.nodes.length} nodes, {graphData.links.length} edges)
            </h2>
          </div>

          {graphData.nodes.length > 0 ? (
            <div className="bg-gray-950 border border-gray-800 rounded overflow-hidden">
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                width={1700}
                height={500}
                backgroundColor="#030712"
                nodeLabel="name"
                nodeAutoColorBy="type"
                nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                  const label = node.name;
                  const fontSize = 12 / globalScale;
                  ctx.font = `bold ${fontSize}px Sans-Serif`;
                  
                  // Draw node circle with border
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI, false);
                  ctx.fillStyle = node.type === "Person" ? "#60a5fa" : 
                                   node.type === "Organization" ? "#34d399" : 
                                   node.type === "Location" ? "#f59e0b" : "#9ca3af";
                  ctx.fill();
                  ctx.strokeStyle = "#ffffff";
                  ctx.lineWidth = 2;
                  ctx.stroke();
                  
                  // Draw label with background
                  const textWidth = ctx.measureText(label).width;
                  const labelY = node.y + 16;
                  const padding = 3;
                  
                  // Background
                  ctx.fillStyle = "#1f2937";
                  ctx.fillRect(
                    node.x - textWidth / 2 - padding,
                    labelY - fontSize / 2 - padding,
                    textWidth + padding * 2,
                    fontSize + padding * 2
                  );
                  
                  // Text
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillStyle = "#f3f4f6";
                  ctx.fillText(label, node.x, labelY);
                }}
                linkLabel="label"
                linkColor={() => "#6b7280"}
                linkWidth={2}
                linkDirectionalArrowLength={8}
                linkDirectionalArrowRelPos={1}
                linkCanvasObjectMode={() => "after"}
                linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                  const label = link.label;
                  const fontSize = 11 / globalScale;
                  ctx.font = `bold ${fontSize}px Sans-Serif`;
                  
                  // Calculate midpoint
                  const start = link.source;
                  const end = link.target;
                  if (typeof start === "object" && typeof end === "object") {
                    const textX = (start.x + end.x) / 2;
                    const textY = (start.y + end.y) / 2;
                    
                    // Measure text
                    const textWidth = ctx.measureText(label).width;
                    const padding = 4;
                    const bgHeight = fontSize + padding * 2;
                    
                    // Draw background with border
                    ctx.fillStyle = "#1f2937";
                    ctx.strokeStyle = "#374151";
                    ctx.lineWidth = 1;
                    ctx.fillRect(
                      textX - textWidth / 2 - padding, 
                      textY - fontSize / 2 - padding, 
                      textWidth + padding * 2, 
                      bgHeight
                    );
                    ctx.strokeRect(
                      textX - textWidth / 2 - padding, 
                      textY - fontSize / 2 - padding, 
                      textWidth + padding * 2, 
                      bgHeight
                    );
                    
                    // Draw label text
                    ctx.fillStyle = "#e5e7eb";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(label, textX, textY);
                  }
                }}
                cooldownTicks={100}
                onEngineStop={() => {
                  if (graphRef.current) {
                    graphRef.current.zoomToFit(400, 50);
                  }
                }}
              />
            </div>
          ) : (
            <div className="bg-gray-950 border border-gray-800 rounded p-12 text-center">
              <p className="text-sm text-gray-500">
                Extract a knowledge graph to visualize it here
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
