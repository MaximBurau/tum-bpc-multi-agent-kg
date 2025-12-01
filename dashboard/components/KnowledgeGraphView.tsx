"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/**
 * Interactive knowledge graph visualization using react-force-graph-2d.
 */

interface Entity {
  name: string;
  entity_type?: string;
}

interface Relation {
  head: string;
  relation: string;
  tail: string;
}

interface KnowledgeGraphViewProps {
  entities: Entity[];
  relations: Relation[];
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

// Small, fixed palette for entity types.
// Types are mapped to colors dynamically so we don't depend on specific schema names.
const TYPE_COLOR_PALETTE = [
  "#60a5fa", // blue
  "#34d399", // green
  "#f59e0b", // amber
  "#a78bfa", // purple
  "#fb923c", // orange
  "#ef4444", // red
  "#10b981", // emerald
  "#6366f1", // indigo
];

function buildTypeColorMap(nodes: GraphNode[]): Map<string, string> {
  const typeSet = new Set<string>();
  nodes.forEach((n) => {
    if (n.type && typeof n.type === "string") {
      typeSet.add(n.type);
    }
  });

  const map = new Map<string, string>();
  Array.from(typeSet).forEach((type, idx) => {
    map.set(type, TYPE_COLOR_PALETTE[idx % TYPE_COLOR_PALETTE.length]);
  });

  return map;
}

// Convert entities and relations to graph format
function convertToGraphData(
  entities: Entity[],
  relations: Relation[]
): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeSet = new Set<string>();

  // Add nodes from entities
  const entitiesArray = entities && Array.isArray(entities) ? entities : [];
  entitiesArray.forEach((entity) => {
    if (entity && entity.name && !nodeSet.has(entity.name)) {
      nodes.push({
        id: entity.name,
        name: entity.name,
        type: entity.entity_type,
        val: 10,
      });
      nodeSet.add(entity.name);
    }
  });

  // Add nodes and links from relations
  const relationsArray = relations && Array.isArray(relations) ? relations : [];
  relationsArray.forEach((rel) => {
    if (!rel) return;

    // Handle both formats: {head, relation, tail} and {subject, predicate, object}
    const source = (rel as any).head || (rel as any).subject;
    const target = (rel as any).tail || (rel as any).object;
    const label = (rel as any).relation || (rel as any).predicate;

    if (!source || !target || !label) return;

    // Add source node if not exists
    if (!nodeSet.has(source)) {
      nodes.push({
        id: source,
        name: source,
        type: (rel as any).head_type || (rel as any).subject_type,
        val: 10,
      });
      nodeSet.add(source);
    }

    // Add target node if not exists
    if (!nodeSet.has(target)) {
      nodes.push({
        id: target,
        name: target,
        type: (rel as any).tail_type || (rel as any).object_type,
        val: 10,
      });
      nodeSet.add(target);
    }

    // Add link
    links.push({
      source,
      target,
      label,
    });
  });

  return { nodes, links };
}

export default function KnowledgeGraphView({ entities, relations }: KnowledgeGraphViewProps) {
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Update dimensions based on container
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const width = rect.width > 0 ? rect.width : window.innerWidth - 200; // Account for padding
        setDimensions({
          width: Math.max(800, width),
          height: 500,
        });
      } else {
        // Fallback: use viewport width minus margins
        setDimensions({ 
          width: Math.max(800, typeof window !== 'undefined' ? window.innerWidth - 200 : 1200), 
          height: 500 
        });
      }
    };

    // Initial update with delay to ensure DOM is ready
    const timer = setTimeout(updateDimensions, 200);
    window.addEventListener("resize", updateDimensions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  // Convert data format when entities/relations change
  useEffect(() => {
    const data = convertToGraphData(entities, relations);
    setGraphData(data);
  }, [entities, relations]);

  // Auto-fit when graph data changes
  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0) {
      // Wait for graph to render and physics to settle
      const timer = setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [graphData]);

  if (graphData.nodes.length === 0 && graphData.links.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-8">
        No knowledge graph data to visualize
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-lg p-4 w-full">
      <div className="text-xs text-gray-500 text-center mb-2">
        💡 Drag to pan • Scroll to zoom • Drag nodes to rearrange
      </div>
      <div 
        ref={containerRef}
        className="bg-gray-950 border border-gray-800 rounded overflow-hidden"
        style={{ width: "100%", minHeight: "500px" }}
      >
        {(() => {
          const typeColors = buildTypeColorMap(graphData.nodes);
          const getTypeColor = (type?: string) =>
            (type && typeColors.get(type)) || "#9ca3af";

          return (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#030712"
          nodeLabel="name"
          nodeAutoColorBy="type"
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = node.name || "";
            const fontSize = 12 / globalScale;
            ctx.font = `bold ${fontSize}px Sans-Serif`;
            
            // Draw node circle with border
            ctx.beginPath();
            ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI, false);
            ctx.fillStyle = getTypeColor(node.type);
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
            const label = link.label || "";
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
            if (graphRef.current && graphData.nodes.length > 0) {
              graphRef.current.zoomToFit(400, 50);
            }
          }}
        />
          );
        })()}
      </div>
      
      {/* Legend */}
      {graphData.nodes.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center mt-3 pt-3 border-t border-gray-800">
          {(() => {
            const typeColors = buildTypeColorMap(graphData.nodes);
            return Array.from(new Set(graphData.nodes.map(n => n.type).filter(Boolean))).map(type => (
              <div key={type as string} className="flex items-center gap-1.5 text-xs text-gray-400">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: (type && typeColors.get(type as string)) || "#9ca3af" }}
                />
                {type}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
