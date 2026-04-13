"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

type JsonVal = unknown;

interface NodeProps {
  label: string | null;
  value: JsonVal;
  depth: number;
  defaultOpen: boolean;
}

export function JsonExplorer({ data }: { data: JsonVal }) {
  return (
    <div className="json-explorer">
      <JsonNode label={null} value={data} depth={0} defaultOpen />
    </div>
  );
}

function JsonNode({ label, value, depth, defaultOpen }: NodeProps) {
  const [open, setOpen] = useState(defaultOpen && depth < 3);

  if (value === null) {
    return (
      <div className="json-line" style={{ paddingLeft: depth * 14 }}>
        {label !== null && <Key label={label} />}
        <span className="json-null">null</span>
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className="json-line" style={{ paddingLeft: depth * 14 }}>
        {label !== null && <Key label={label} />}
        <span className="json-bool">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div className="json-line" style={{ paddingLeft: depth * 14 }}>
        {label !== null && <Key label={label} />}
        <span className="json-num">{value}</span>
      </div>
    );
  }

  if (typeof value === "string") {
    return (
      <div className="json-line" style={{ paddingLeft: depth * 14 }}>
        {label !== null && <Key label={label} />}
        <span className="json-str">&quot;{escapeStr(value)}&quot;</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="json-line" style={{ paddingLeft: depth * 14 }}>
          {label !== null && <Key label={label} />}
          <span className="json-punct">[]</span>
        </div>
      );
    }
    return (
      <div className="json-branch">
        <div className="json-line json-line-toggle" style={{ paddingLeft: depth * 14 }}>
          <button
            type="button"
            className="json-chevron"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {label !== null && <Key label={label} />}
          <span className="json-punct">[</span>
          {!open && (
            <span className="json-meta">
              {" "}
              {value.length} item{value.length === 1 ? "" : "s"}{" "}
            </span>
          )}
          {!open && <span className="json-punct">]</span>}
        </div>
        {open && (
          <div className="json-children">
            {value.map((item, idx) => (
              <JsonNode
                key={idx}
                label={String(idx)}
                value={item}
                depth={depth + 1}
                defaultOpen={defaultOpen}
              />
            ))}
            <div className="json-line" style={{ paddingLeft: (depth + 1) * 14 }}>
              <span className="json-punct">]</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, JsonVal>);
    if (entries.length === 0) {
      return (
        <div className="json-line" style={{ paddingLeft: depth * 14 }}>
          {label !== null && <Key label={label} />}
          <span className="json-punct">{"{}"}</span>
        </div>
      );
    }
    return (
      <div className="json-branch">
        <div className="json-line json-line-toggle" style={{ paddingLeft: depth * 14 }}>
          <button
            type="button"
            className="json-chevron"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {label !== null && <Key label={label} />}
          <span className="json-punct">{"{"}</span>
          {!open && (
            <span className="json-meta">
              {" "}
              {entries.length} key{entries.length === 1 ? "" : "s"}{" "}
            </span>
          )}
          {!open && <span className="json-punct">{"}"}</span>}
        </div>
        {open && (
          <div className="json-children">
            {entries.map(([k, v]) => (
              <JsonNode
                key={k}
                label={k}
                value={v}
                depth={depth + 1}
                defaultOpen={defaultOpen}
              />
            ))}
            <div className="json-line" style={{ paddingLeft: (depth + 1) * 14 }}>
              <span className="json-punct">{"}"}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="json-line" style={{ paddingLeft: depth * 14 }}>
      {label !== null && <Key label={label} />}
      <span className="json-plain">{String(value)}</span>
    </div>
  );
}

function Key({ label }: { label: string }) {
  const isIndex = /^\d+$/.test(label);
  if (isIndex) {
    return (
      <>
        <span className="json-index">{label}</span>
        <span className="json-colon">: </span>
      </>
    );
  }
  return (
    <>
      <span className="json-key">&quot;{escapeStr(label)}&quot;</span>
      <span className="json-colon">: </span>
    </>
  );
}

function escapeStr(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
