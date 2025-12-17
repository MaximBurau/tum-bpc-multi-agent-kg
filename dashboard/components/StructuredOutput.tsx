"use client";

/**
 * Smart renderer for structured agent outputs.
 * Automatically detects the shape of data and renders it nicely.
 * Works with any Pydantic-style structured output.
 */

interface StructuredOutputProps {
  data: unknown;
  label?: string;
  depth?: number;
}

// Colors for different field types
const TYPE_COLORS: Record<string, string> = {
  head: "text-blue-400",
  tail: "text-blue-400",
  name: "text-blue-400",
  entity_type: "text-gray-500",
  relation: "text-green-400",
  type: "text-purple-400",
  description: "text-gray-400",
  default: "text-gray-300",
};

function getFieldColor(key: string): string {
  return TYPE_COLORS[key] || TYPE_COLORS.default;
}

// Detect if array items are "triple-like" (head, relation, tail)
function isTripleLike(item: Record<string, unknown>): boolean {
  return "head" in item && "relation" in item && "tail" in item;
}

// Detect if array items are "entity-like" (name, entity_type or type)
function isEntityLike(item: Record<string, unknown>): boolean {
  return "name" in item && ("entity_type" in item || "type" in item);
}

// Render a single object as a compact badge/pill
function ObjectBadge({ obj, keys }: { obj: Record<string, unknown>; keys: string[] }) {
  const primary = keys[0];
  const secondary = keys.length > 1 ? keys[1] : null;
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 rounded text-xs">
      <span className={getFieldColor(primary)}>{String(obj[primary] || "")}</span>
      {secondary && obj[secondary] !== undefined && obj[secondary] !== null ? (
        <span className={`${getFieldColor(secondary)} ml-1`}>
          ({String(obj[secondary])})
        </span>
      ) : null}
    </span>
  );
}

// Render a triple (head → relation → tail)
function TripleRow({ triple }: { triple: Record<string, unknown> }) {
  return (
    <div className="text-xs font-mono bg-gray-800/50 px-2 py-1 rounded flex items-center gap-2">
      <span className="text-blue-400">{String(triple.head || "")}</span>
      <span className="text-gray-500">→</span>
      <span className="text-green-400">{String(triple.relation || "")}</span>
      <span className="text-gray-500">→</span>
      <span className="text-blue-400">{String(triple.tail || "")}</span>
    </div>
  );
}

// Render an array of objects as a table
function ObjectTable({ items, keys }: { items: Record<string, unknown>[]; keys: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700">
            {keys.map((key) => (
              <th key={key} className="text-left py-1 px-2 text-gray-500 font-medium">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-gray-800/50">
              {keys.map((key) => (
                <td key={key} className={`py-1 px-2 ${getFieldColor(key)}`}>
                  {typeof item[key] === "object" 
                    ? JSON.stringify(item[key]) 
                    : String(item[key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Main structured output renderer
export default function StructuredOutput({ data, label, depth = 0 }: StructuredOutputProps) {
  // Null/undefined
  if (data === null || data === undefined) {
    return <span className="text-gray-500 text-xs italic">null</span>;
  }

  // Primitives
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return (
      <span className="text-gray-300 text-sm">
        {typeof data === "string" && data.length > 100 
          ? `${data.substring(0, 100)}...` 
          : String(data)}
      </span>
    );
  }

  // Arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-gray-500 text-xs italic">empty array</span>;
    }

    const firstItem = data[0];
    
    // Array of primitives
    if (typeof firstItem !== "object" || firstItem === null) {
      return (
        <div className="flex flex-wrap gap-1">
          {data.map((item, i) => (
            <span key={i} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
              {String(item)}
            </span>
          ))}
        </div>
      );
    }

    // Array of objects - detect type
    const keys = Object.keys(firstItem);
    
    // Triple-like: render as triple rows
    if (isTripleLike(firstItem as Record<string, unknown>)) {
      return (
        <div className="space-y-1">
          {data.map((item, i) => (
            <TripleRow key={i} triple={item as Record<string, unknown>} />
          ))}
        </div>
      );
    }

    // Entity-like with 2-3 keys: render as badges
    if (isEntityLike(firstItem as Record<string, unknown>) && keys.length <= 3) {
      const displayKeys = ["name", keys.find(k => k.includes("type")) || keys[1]].filter(Boolean) as string[];
      return (
        <div className="flex flex-wrap gap-2">
          {data.map((item, i) => (
            <ObjectBadge key={i} obj={item as Record<string, unknown>} keys={displayKeys} />
          ))}
        </div>
      );
    }

    // Small arrays of objects with few keys: badges
    if (data.length <= 10 && keys.length <= 2) {
      return (
        <div className="flex flex-wrap gap-2">
          {data.map((item, i) => (
            <ObjectBadge key={i} obj={item as Record<string, unknown>} keys={keys} />
          ))}
        </div>
      );
    }

    // Larger arrays or more keys: table view
    return <ObjectTable items={data as Record<string, unknown>[]} keys={keys} />;
  }

  // Objects
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    
    // Skip internal/trace keys
    const displayKeys = keys.filter(k => !k.startsWith("_"));
    
    if (displayKeys.length === 0) {
      return <span className="text-gray-500 text-xs italic">empty</span>;
    }

    return (
      <div className={`space-y-2 ${depth > 0 ? "pl-3 border-l border-gray-700" : ""}`}>
        {displayKeys.map((key) => (
          <div key={key}>
            <div className="text-xs font-medium text-gray-500 mb-1">{key}</div>
            <StructuredOutput data={obj[key]} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  // Fallback: JSON
  return (
    <pre className="text-xs text-gray-400 bg-gray-800/50 p-2 rounded overflow-x-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// Convenience component for rendering step outputs
export function StepOutput({ 
  stepId, 
  output, 
  trace 
}: { 
  stepId: string; 
  output: Record<string, unknown>; 
  trace?: Record<string, unknown>;
}) {
  const agent = trace?.agent as string || "unknown";
  const duration = typeof trace?.duration_seconds === "number" 
    ? trace.duration_seconds.toFixed(2) 
    : "?";

  // Get output keys (exclude internal ones)
  const outputKeys = Object.keys(output).filter(k => !k.startsWith("_"));

  return (
    <details className="bg-gray-800/30 rounded border border-gray-800">
      <summary className="px-3 py-2 cursor-pointer text-sm hover:bg-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-200">{stepId}</span>
          <span className="text-xs text-gray-500">({agent})</span>
        </div>
        <span className="text-xs text-gray-500">{duration}s</span>
      </summary>
      <div className="px-3 py-3 border-t border-gray-800 space-y-3">
        {outputKeys.map((key) => (
          <div key={key}>
            <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              {key}
              {Array.isArray(output[key]) && (
                <span className="text-gray-600 ml-1">({(output[key] as unknown[]).length})</span>
              )}
            </h5>
            <StructuredOutput data={output[key]} />
          </div>
        ))}
        
        {/* Show rendered prompt in a collapsible */}
        {trace && typeof trace.rendered_prompt === "string" && trace.rendered_prompt.length > 0 ? (
          <details className="mt-2">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
              View rendered prompt
            </summary>
            <pre className="mt-2 text-xs text-gray-500 bg-gray-900 p-2 rounded whitespace-pre-wrap">
              {trace.rendered_prompt}
            </pre>
          </details>
        ) : null}
      </div>
    </details>
  );
}

