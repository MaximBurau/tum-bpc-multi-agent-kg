/**
 * GraphViewer component
 * 
 * Renders the knowledge graph visualization using vis-network.
 * Supports interactive exploration of nodes and edges.
 */

'use client';

import { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import type { Data, Options } from 'vis-network';

interface GraphViewerProps {
  data?: Data;
}

export default function GraphViewer({ data }: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const graphData: Data = data || {
      nodes: [],
      edges: [],
    };

    const options: Options = {
      nodes: {
        shape: 'dot',
        size: 16,
        font: {
          size: 14,
          color: '#e5e7eb', // gray-200
        },
        borderWidth: 2,
        color: {
          background: '#3b82f6', // blue-500
          border: '#60a5fa', // blue-400
          highlight: {
            background: '#2563eb',
            border: '#93c5fd',
          }
        }
      },
      edges: {
        width: 2,
        color: {
          color: '#4b5563', // gray-600
          highlight: '#9ca3af', // gray-400
        },
        arrows: 'to',
      },
      physics: {
        enabled: true,
        stabilization: {
          iterations: 100,
        },
      },
      interaction: {
        hover: true,
        navigationButtons: true,
        keyboard: true,
      },
    };

    networkRef.current = new Network(containerRef.current, graphData, options);

    return () => {
      networkRef.current?.destroy();
    };
  }, [data]);

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-gray-800 relative">
      <div
        ref={containerRef}
        className="min-h-[600px] border-2 border-gray-800 rounded-lg bg-gray-950"
        style={{ height: '600px' }}
      />
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center bg-gray-900/80 p-6 rounded-xl backdrop-blur-sm border border-gray-800">
            <p className="text-gray-400 font-medium">
              Graph visualization will appear here
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Connect to Neo4j to see data
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
