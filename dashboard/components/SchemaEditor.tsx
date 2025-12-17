"use client";

import { useState } from "react";
import { SchemaField } from "@/lib/api/client";

interface SchemaEditorProps {
  value: SchemaField[];
  onChange: (schema: SchemaField[]) => void;
}

type FieldType = "str" | "int" | "float" | "bool" | "list" | "object";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "str", label: "Text (string)" },
  { value: "int", label: "Number (integer)" },
  { value: "float", label: "Decimal (float)" },
  { value: "bool", label: "Boolean (true/false)" },
  { value: "list", label: "List of items" },
  { value: "object", label: "Nested object" },
];

interface FieldEditorProps {
  field: SchemaField;
  onUpdate: (field: SchemaField) => void;
  onRemove: () => void;
  depth?: number;
}

function FieldEditor({ field, onUpdate, onRemove, depth = 0 }: FieldEditorProps) {
  const getFieldType = (): FieldType => {
    if (typeof field.type === "string") {
      return field.type as FieldType;
    }
    if (field.type.type === "list") return "list";
    if (field.type.type === "object") return "object";
    return "str";
  };

  const [fieldType, setFieldType] = useState<FieldType>(getFieldType());

  const handleNameChange = (name: string) => {
    onUpdate({ ...field, name });
  };

  const handleTypeChange = (newType: FieldType) => {
    setFieldType(newType);
    
    if (newType === "list") {
      onUpdate({
        name: field.name,
        type: {
          type: "list",
          items: { type: "object", fields: [{ name: "item", type: "str" }] }
        }
      });
    } else if (newType === "object") {
      onUpdate({
        name: field.name,
        type: {
          type: "object",
          fields: [{ name: "field1", type: "str" }]
        }
      });
    } else {
      onUpdate({ name: field.name, type: newType });
    }
  };

  const getNestedFields = (): SchemaField[] => {
    if (typeof field.type === "object") {
      if (field.type.type === "list" && typeof field.type.items === "object") {
        const items = field.type.items as { fields?: SchemaField[] };
        return items.fields || [];
      }
      if (field.type.type === "object") {
        return (field.type.fields as SchemaField[]) || [];
      }
    }
    return [];
  };

  const updateNestedFields = (newFields: SchemaField[]) => {
    if (typeof field.type === "object") {
      if (field.type.type === "list") {
        onUpdate({
          ...field,
          type: {
            type: "list",
            items: { type: "object", fields: newFields }
          }
        });
      } else if (field.type.type === "object") {
        onUpdate({
          ...field,
          type: {
            type: "object",
            fields: newFields
          }
        });
      }
    }
  };

  const nestedFields = getNestedFields();
  const indent = depth * 16;

  return (
    <div className="space-y-2" style={{ marginLeft: indent }}>
      <div className="flex items-center gap-2 bg-gray-900/50 p-2 rounded border border-gray-800">
        <input
          type="text"
          value={field.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Field name"
          className="flex-1 px-2 py-1 bg-gray-950 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={fieldType}
          onChange={(e) => handleTypeChange(e.target.value as FieldType)}
          className="px-2 py-1 bg-gray-950 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
          title="Remove field"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nested fields for list/object types */}
      {(fieldType === "list" || fieldType === "object") && (
        <div className="pl-4 border-l-2 border-gray-700 space-y-2">
          <div className="text-xs text-gray-500 mb-1">
            {fieldType === "list" ? "List item fields:" : "Object fields:"}
          </div>
          {nestedFields.map((nestedField, idx) => (
            <FieldEditor
              key={idx}
              field={nestedField}
              depth={depth + 1}
              onUpdate={(updated) => {
                const newFields = [...nestedFields];
                newFields[idx] = updated;
                updateNestedFields(newFields);
              }}
              onRemove={() => {
                const newFields = nestedFields.filter((_, i) => i !== idx);
                updateNestedFields(newFields.length > 0 ? newFields : [{ name: "field", type: "str" }]);
              }}
            />
          ))}
          <button
            onClick={() => updateNestedFields([...nestedFields, { name: `field${nestedFields.length + 1}`, type: "str" }])}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add nested field
          </button>
        </div>
      )}
    </div>
  );
}

export default function SchemaEditor({ value, onChange }: SchemaEditorProps) {
  const addField = () => {
    onChange([...value, { name: `field${value.length + 1}`, type: "str" }]);
  };

  const updateField = (index: number, field: SchemaField) => {
    const newSchema = [...value];
    newSchema[index] = field;
    onChange(newSchema);
  };

  const removeField = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400 font-medium">Output Schema</label>
        <button
          onClick={addField}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add field
        </button>
      </div>

      {value.length === 0 ? (
        <div className="text-center py-4 text-gray-500 text-sm border border-dashed border-gray-700 rounded">
          No fields defined. Click &quot;Add field&quot; to start building the schema.
        </div>
      ) : (
        <div className="space-y-2">
          {value.map((field, idx) => (
            <FieldEditor
              key={idx}
              field={field}
              onUpdate={(updated) => updateField(idx, updated)}
              onRemove={() => removeField(idx)}
            />
          ))}
        </div>
      )}

      {/* Schema preview */}
      <details className="text-xs">
        <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
          View JSON schema
        </summary>
        <pre className="mt-2 p-2 bg-gray-950 border border-gray-800 rounded text-gray-400 overflow-x-auto">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    </div>
  );
}

