"use client";

import { useMemo, useState } from "react";
import { Copy, Check, ListTree, FileCode } from "lucide-react";
import { JsonExplorer } from "@/components/mcp/JsonExplorer";
import { JsonHighlighted } from "@/components/mcp/jsonHighlight";

type ViewTab = "explorer" | "json";

interface Props {
  payloadJson: string;
  title?: string;
}

export function TracePayloadView({ payloadJson, title = "Payload" }: Props) {
  const { parsed, pretty, raw } = useMemo(() => {
    const rawText = payloadJson.trim();
    try {
      const p = JSON.parse(payloadJson) as unknown;
      return {
        parsed: p,
        pretty: JSON.stringify(p, null, 2),
        raw: rawText,
      };
    } catch {
      return { parsed: null, pretty: rawText, raw: rawText };
    }
  }, [payloadJson]);

  const showExplorer = parsed !== null && typeof parsed === "object";
  const [tab, setTab] = useState<ViewTab>(() =>
    showExplorer ? "explorer" : "json"
  );
  const [copied, setCopied] = useState(false);

  const effectiveTab: ViewTab =
    tab === "explorer" && !showExplorer ? "json" : tab;

  function copy() {
    void navigator.clipboard.writeText(pretty || raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="tool-result-view trace-payload-view">
      <div className="tool-result-toolbar">
        <span className="tool-result-title">{title}</span>
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
          <pre className="tool-result-pre tool-result-highlight trace-payload-pre">
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
