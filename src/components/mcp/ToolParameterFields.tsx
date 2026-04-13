"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Switch } from "@/components/ui/Switch";
import type { JsonSchema } from "@/types/mcp";
import { schemaPrimaryType } from "@/lib/mcp/tool-args-coerce";

export function ParamField({
  name,
  schema,
  required,
  value,
  onChange,
  fieldStableKey,
}: {
  name: string;
  schema: JsonSchema;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  fieldStableKey: string;
}) {
  const isEnum = schema.enum && schema.enum.length > 0;
  const isBoolean = schemaPrimaryType(schema) === "boolean";
  const typeLabel = Array.isArray(schema.type)
    ? schema.type.join(" | ")
    : String(schema.type ?? "any");

  if (isBoolean) {
    return (
      <ParamBoolField
        name={name}
        schema={schema}
        required={required}
        value={value}
        onChange={onChange}
        fieldStableKey={fieldStableKey}
        typeLabel={typeLabel}
      />
    );
  }

  return (
    <div className="param-field">
      <label className="param-label">
        {name}
        {required && <span className="required-dot">*</span>}
        <span className="param-type">{typeLabel}</span>
      </label>
      {schema.description && <p className="param-hint">{schema.description}</p>}
      {isEnum ? (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- select --</option>
          {schema.enum!.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          placeholder={schema.default !== undefined ? String(schema.default) : ""}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function ParamBoolField({
  name,
  schema,
  required,
  value,
  onChange,
  fieldStableKey,
  typeLabel,
}: {
  name: string;
  schema: JsonSchema;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  fieldStableKey: string;
  typeLabel: string;
}) {
  const switchId = `param-bool-${fieldStableKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const unset = !required && value === "";
  const checked = value === "true";
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!required) return;
    if (value !== "") return;
    const d = schema.default;
    onChangeRef.current(d !== undefined ? String(Boolean(d)) : "false");
  }, [fieldStableKey, required, value, schema.default]);

  return (
    <div className="param-field">
      <label className="param-label" htmlFor={switchId}>
        {name}
        {required && <span className="required-dot">*</span>}
        <span className="param-type">{typeLabel}</span>
      </label>
      {schema.description && <p className="param-hint">{schema.description}</p>}
      <div className="param-bool-row">
        <Switch
          id={switchId}
          checked={checked}
          unset={unset}
          onCheckedChange={(next) => {
            if (unset) {
              onChange("false");
              return;
            }
            onChange(next ? "true" : "false");
          }}
        />
        {!required && !unset && (
          <button type="button" className="btn-ghost btn-ghost-sm" onClick={() => onChange("")}>
            Omit
          </button>
        )}
        {unset && <span className="param-bool-unset-hint">Not sent</span>}
      </div>
    </div>
  );
}

/** Same parameter grid as tool detail; values are string form state. */
export function ToolParameterForm({
  properties,
  requiredKeys,
  values,
  onFieldChange,
  fieldKeyPrefix,
}: {
  properties: Record<string, JsonSchema>;
  requiredKeys: string[];
  values: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  fieldKeyPrefix: string;
}) {
  const keys = Object.keys(properties);
  if (keys.length === 0) return null;
  return (
    <div className="detail-section testing-suite-params">
      <h4 className="section-title testing-suite-params-title">Parameters</h4>
      <div className="params-grid">
        {keys.map((key) => (
          <ParamField
            key={`${fieldKeyPrefix}:${key}`}
            name={key}
            schema={properties[key]!}
            required={requiredKeys.includes(key)}
            value={values[key] ?? ""}
            fieldStableKey={`${fieldKeyPrefix}:${key}`}
            onChange={(v) => onFieldChange(key, v)}
          />
        ))}
      </div>
    </div>
  );
}
