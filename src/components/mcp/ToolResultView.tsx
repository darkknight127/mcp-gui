"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Copy, Check, ListTree, FileCode, Save } from "lucide-react";
import type { ToolCallResponse, McpContent } from "@/types/mcp";
import { JsonExplorer } from "@/components/mcp/JsonExplorer";
import { JsonHighlighted } from "@/components/mcp/jsonHighlight";

type ViewTab = "explorer" | "json";

function extractText(content: McpContent[]): string {
  return content
    .map((c) => {
      if (c.type === "text" && c.text) return c.text;
      if (c.type === "image") return "[image]";
      if (c.type === "resource") return c.text ?? `[resource${c.mimeType ? `: ${c.mimeType}` : ""}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function stripCodeFence(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    const end = t.lastIndexOf("```");
    if (end > 3) {
      const inner = t.slice(3, end).replace(/^(?:json)?\s*\r?\n?/i, "");
      return inner.trim();
    }
  }
  return t;
}

function tryParseJson(text: string): unknown | null {
  const t = stripCodeFence(text);
  if (!t) return null;
  const looksJson =
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"));
  if (!looksJson) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

interface Props {
  result: ToolCallResponse;
  /** Client-measured round-trip for this MCP call (ms). */
  executionMs?: number | null;
  defaultSaveTitle?: string;
  onSaveResponse?: (title: string) => void;
}

export function ToolResultView({
  result,
  executionMs,
  defaultSaveTitle,
  onSaveResponse,
}: Props) {
  const raw = extractText(result.content);
  const parsed = useMemo(() => tryParseJson(raw), [raw]);
  const pretty = useMemo(() => {
    if (parsed !== null) {
      try {
        return JSON.stringify(parsed, null, 2);
      } catch {
        return raw;
      }
    }
    return raw;
  }, [parsed, raw]);

  const [tab, setTab] = useState<ViewTab>(() =>
    parsed !== null ? "explorer" : "json"
  );
  const [copied, setCopied] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const saveAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (saveOpen) setSaveTitle(defaultSaveTitle ?? "");
  }, [saveOpen, defaultSaveTitle]);

  useEffect(() => {
    if (!saveOpen) return;
    function onDoc(e: MouseEvent) {
      if (saveAnchorRef.current?.contains(e.target as Node)) return;
      setSaveOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [saveOpen]);

  function copy() {
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function confirmSave() {
    if (!onSaveResponse) return;
    onSaveResponse(saveTitle);
    setSaveOpen(false);
  }

  const showExplorer = parsed !== null;
  const effectiveTab: ViewTab =
    tab === "explorer" && !showExplorer ? "json" : tab;

  return (
    <div className={`tool-result-view ${result.isError ? "is-error" : ""}`}>
      <div className="tool-result-toolbar">
        <span className="tool-result-title">
          {result.isError ? "Error response" : "Output"}
          {executionMs != null && executionMs >= 0 && (
            <span className="tool-result-timing"> · {executionMs} ms</span>
          )}
        </span>
        <div className="tool-result-tabs-wrap">
          <div className="tool-result-tabs" role="tablist">
            {showExplorer && (
              <button
                type="button"
                role="tab"
                aria-selected={effectiveTab === "explorer"}
                className={`tool-result-tab ${effectiveTab === "explorer" ? "active" : ""}`}
                onClick={() => setTab("explorer")}
              >
                <ListTree size={14} /> Explorer
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === "json"}
              className={`tool-result-tab ${effectiveTab === "json" ? "active" : ""}`}
              onClick={() => setTab("json")}
            >
              <FileCode size={14} /> JSON
            </button>
          </div>
        </div>
        <div className="tool-result-actions">
          {onSaveResponse && (
            <div className="tool-result-save-anchor" ref={saveAnchorRef}>
              {saveOpen && (
                <div className="tool-save-title-popover" role="dialog" aria-label="Save response">
                  <label className="tool-save-title-label" htmlFor="tool-save-title-input">
                    Title
                  </label>
                  <input
                    id="tool-save-title-input"
                    className="input tool-save-title-input"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmSave();
                      if (e.key === "Escape") setSaveOpen(false);
                    }}
                    autoFocus
                  />
                  <div className="tool-save-title-actions">
                    <button type="button" className="btn-run tool-save-confirm" onClick={confirmSave}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost-sm"
                      onClick={() => setSaveOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                className="copy-btn tool-result-save"
                onClick={() => setSaveOpen((o) => !o)}
              >
                <Save size={12} />
                Save
              </button>
            </div>
          )}
          <button type="button" className="copy-btn tool-result-copy" onClick={copy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="tool-result-body">
        {effectiveTab === "explorer" && showExplorer && (
          <div className="tool-result-pane tool-result-explorer">
            <JsonExplorer data={parsed} />
          </div>
        )}
        {effectiveTab === "json" && (
          <pre className="tool-result-pre tool-result-highlight">
            {parsed !== null ? (
              <JsonHighlighted source={pretty} />
            ) : (
              <span className="tool-result-plain">{raw || "(empty)"}</span>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}
