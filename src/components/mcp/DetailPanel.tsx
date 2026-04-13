"use client";

import { useEffect, useState, useRef } from "react";
import {
  Play,
  Copy,
  Check,
  AlertCircle,
  FileText,
  MessageSquare,
  ExternalLink,
  Trash2,
  ChevronDown,
  FlaskConical,
  BookOpen,
} from "lucide-react";
import { MarkdownText } from "@/components/mcp/MarkdownText";
import { ToolResultView } from "@/components/mcp/ToolResultView";
import { ToolExecutionsPanel } from "@/components/mcp/ToolExecutionsPanel";
import { TraceSetupGuide } from "@/components/mcp/TraceSetupGuide";
import { TestSuiteWorkspace } from "@/components/mcp/TestingPanel";
import { addSavedToolResponse, removeSavedToolResponse } from "@/lib/saved-responses-storage";
import { argsRecordToFormStrings } from "@/lib/mcp/tool-args-prefill";
import { coerceArgs } from "@/lib/mcp/tool-args-coerce";
import { api } from "@/lib/api-client";
import { notifyTestSuitesMutated } from "@/lib/mcp/test-suites-storage";
import { ParamField } from "@/components/mcp/ToolParameterFields";
import { useToolRuns } from "@/context/tool-run-context";
import { SpinnerSvg } from "@/components/ui/SpinnerSvg";
import type {
  McpTreeNode,
  McpTool,
  McpResource,
  McpPrompt,
  ToolCallResponse,
  McpContent,
  SavedToolResponse,
  TestSuiteTreePayload,
} from "@/types/mcp";
import type { PersistedTestSuite } from "@/lib/mcp/test-suites-types";
import { useTraceDebuggerCheck } from "@/hooks/use-trace-debugger-check";

interface Props {
  node: McpTreeNode | null;
  hasConnection: boolean;
  connectionId: string | null;
  /** Server advertised `__debug_trace` on last tree refresh (Executions tab). */
  debugTraceAvailable?: boolean;
  savedList: SavedToolResponse[];
  onCallTool: (tool: McpTool, args: Record<string, unknown>) => Promise<ToolCallResponse>;
  onReadResource: (resource: McpResource) => Promise<McpContent[]>;
  onGetPrompt: (prompt: McpPrompt, args?: Record<string, string>) => Promise<McpContent[]>;
  onSavedMutate: () => void;
  onJumpToTool: (connectionId: string, toolName: string) => void;
  onJumpToTraceTarget: (
    connectionId: string,
    stepType: string | null,
    logicalName: string
  ) => void;
  onJumpToToolWithArgs: (
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => void;
  /** Tools for the active connection (for test suites). */
  toolsForConnection: McpTool[];
  testSuitesForConnection: PersistedTestSuite[];
  onTestSuiteDeleted?: () => void;
  /** Same runner as tool detail (tree busy state). */
  callToolTracked: (
    connectionId: string,
    tool: McpTool,
    args: Record<string, unknown>
  ) => Promise<ToolCallResponse>;
  toolArgsPrefill: {
    connectionId: string;
    toolName: string;
    args: Record<string, unknown>;
  } | null;
  onConsumeToolPrefill: () => void;
}

export function DetailPanel({
  node,
  hasConnection,
  connectionId,
  debugTraceAvailable = false,
  savedList,
  onCallTool,
  onReadResource,
  onGetPrompt,
  onSavedMutate,
  onJumpToTool,
  onJumpToTraceTarget,
  onJumpToToolWithArgs,
  toolsForConnection,
  testSuitesForConnection,
  onTestSuiteDeleted,
  callToolTracked,
  toolArgsPrefill,
  onConsumeToolPrefill,
}: Props) {
  const isTraceLogHub = node?.kind === "executions_hub";
  const [traceSetupGuideOpen, setTraceSetupGuideOpen] = useState(false);
  const traceDbg = useTraceDebuggerCheck(
    isTraceLogHub && connectionId ? connectionId : null,
    Boolean(isTraceLogHub && connectionId && hasConnection)
  );

  useEffect(() => {
    if (!isTraceLogHub) setTraceSetupGuideOpen(false);
  }, [isTraceLogHub]);

  if (!node) {
    return (
      <div className="detail-empty">
        <div className="detail-empty-inner">
          <div className="detail-empty-icon">⌘</div>
          <p className="detail-empty-title">Select an item</p>
          <p className="detail-empty-sub">Click any tool, resource, or prompt in the tree</p>
        </div>
      </div>
    );
  }

  if (node.kind === "saved_response") {
    const stub = node.data as SavedToolResponse;
    const saved =
      savedList.find((s) => s.id === stub.id) ?? stub;
    return (
      <SavedResponseDetail
        saved={saved}
        onSavedMutate={onSavedMutate}
        onJumpToTool={onJumpToTool}
        onJumpToToolWithArgs={onJumpToToolWithArgs}
      />
    );
  }

  if (!hasConnection) {
    return (
      <div className="detail-empty">
        <div className="detail-empty-inner">
          <div className="detail-empty-icon">⌘</div>
          <p className="detail-empty-title">Select a server</p>
          <p className="detail-empty-sub">Choose a connection in the sidebar</p>
        </div>
      </div>
    );
  }

  if (node.kind === "tool") {
    const tool = node.data as McpTool;
    const argsPrefill =
      toolArgsPrefill &&
      connectionId === toolArgsPrefill.connectionId &&
      tool.name === toolArgsPrefill.toolName
        ? toolArgsPrefill.args
        : null;
    return (
      <ToolDetail
        node={node}
        onCall={onCallTool}
        connectionId={connectionId}
        connectionTools={toolsForConnection}
        onSavedMutate={onSavedMutate}
        argsPrefill={argsPrefill}
        onConsumeArgsPrefill={onConsumeToolPrefill}
        paramFieldKeyPrefix={`${connectionId}:${tool.name}`}
      />
    );
  }

  if (node.kind === "executions_hub" && connectionId) {
    return (
      <div className="detail-panel detail-panel-tool detail-panel-executions-hub">
        <div className="detail-tool-header">
          <div className="executions-detail-header-row">
            <div className="detail-header executions-detail-header-main">
              <div className="detail-kind-badge tool">Log</div>
              <h2 className="detail-title">Trace log</h2>
              {node.description && <MarkdownText text={node.description} />}
              <p className="field-hint executions-hub-hint">
                {debugTraceAvailable ? (
                  <>
                    Trace steps from <code className="inline-code">__debug_trace</code> (success and
                    failure). Use <strong>Setup guide</strong> only when you want the full how-to
                    (it does not replace this view). In the panel below, use <strong>Check debugger</strong>{" "}
                    to verify the live session, then pull to load executions. Click a <strong>name</strong>{" "}
                    to jump to that tool, resource, or prompt.
                  </>
                ) : (
                  <>
                    The tool list for this connection does not include{" "}
                    <code className="inline-code">__debug_trace</code> yet — that is separate from
                    whether you already have saved rows. Open <strong>Setup guide</strong> when you
                    want steps to add the tool, refresh the connection, then use{" "}
                    <strong>Check debugger</strong> in the panel to confirm the session.
                  </>
                )}
              </p>
            </div>
            <div className="executions-detail-header-actions">
              <button
                type="button"
                className="btn-ghost btn-ghost-sm"
                aria-expanded={traceSetupGuideOpen}
                onClick={() => setTraceSetupGuideOpen((o) => !o)}
              >
                <BookOpen size={14} />
                {traceSetupGuideOpen ? "Hide setup guide" : "Setup guide"}
              </button>
            </div>
          </div>
        </div>
        {traceSetupGuideOpen && debugTraceAvailable && (
          <div className="executions-inline-setup-guide">
            <TraceSetupGuide />
          </div>
        )}
        <ToolExecutionsPanel
          connectionId={connectionId}
          debugTraceAvailable={debugTraceAvailable}
          showSetupGuideInPanel={!debugTraceAvailable && traceSetupGuideOpen}
          traceDebugger={{
            phase: traceDbg.phase,
            detail: traceDbg.detail,
            onCheck: () => void traceDbg.runCheck(),
          }}
          historyTitle="Executions (all)"
          onJumpToTarget={(stepType, logicalName) =>
            onJumpToTraceTarget(connectionId, stepType, logicalName)
          }
        />
      </div>
    );
  }

  if (node.kind === "test_suite" && connectionId) {
    const { suiteId } = node.data as TestSuiteTreePayload;
    const suite = testSuitesForConnection.find((s) => s.id === suiteId);
    if (!suite) {
      return (
        <div className="detail-panel detail-panel-tool detail-panel-executions-hub">
          <div className="detail-tool-header">
            <div className="detail-header">
              <div className="detail-kind-badge tool">Test</div>
              <h2 className="detail-title">Test suite</h2>
              <p className="field-hint executions-hub-hint">
                This suite is not in the list anymore (refresh or pick another suite in the tree).
              </p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="detail-panel detail-panel-tool detail-panel-executions-hub">
        <div className="detail-tool-header">
          <div className="detail-header">
            <div className="detail-kind-badge tool">Test</div>
            <h2 className="detail-title">{suite.name}</h2>
            <p className="field-hint executions-hub-hint">
              <strong>Detail</strong> edits the tool grid. <strong>Summary</strong> runs the suite and
              shows pass/fail counts and success rate.
            </p>
          </div>
        </div>
        <TestSuiteWorkspace
          connectionId={connectionId}
          suite={suite}
          allSuites={testSuitesForConnection}
          tools={toolsForConnection}
          callTool={(tool, args) => callToolTracked(connectionId, tool, args)}
          onSuiteDeleted={onTestSuiteDeleted}
        />
      </div>
    );
  }

  if (node.kind === "resource") {
    return (
      <ResourceDetail node={node} connectionId={connectionId} onRead={onReadResource} />
    );
  }
  if (node.kind === "prompt") {
    return (
      <PromptDetail node={node} connectionId={connectionId} onGet={onGetPrompt} />
    );
  }

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h2 className="detail-title">{node.label}</h2>
        {node.description && <MarkdownText text={node.description} />}
      </div>
    </div>
  );
}

function SavedResponseDetail({
  saved,
  onSavedMutate,
  onJumpToTool,
  onJumpToToolWithArgs,
}: {
  saved: SavedToolResponse;
  onSavedMutate: () => void;
  onJumpToTool: (connectionId: string, toolName: string) => void;
  onJumpToToolWithArgs: (
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => void;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    function onDoc(e: MouseEvent) {
      if (splitRef.current?.contains(e.target as Node)) return;
      setOpenMenu(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  function remove() {
    removeSavedToolResponse(saved.id);
    onSavedMutate();
  }

  const argsPretty = JSON.stringify(saved.args, null, 2);

  return (
    <div className="detail-panel detail-panel-tool">
      <div className="detail-tool-header">
        <div className="detail-header">
          <div className="detail-kind-badge saved">Saved</div>
          <h2 className="detail-title">{saved.title}</h2>
          <p className="saved-detail-sub">
            Tool <code className="inline-code">{saved.toolName}</code> ·{" "}
            {new Date(saved.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="saved-response-actions">
        <div className="open-tool-split" ref={splitRef}>
          <button
            type="button"
            className="btn-ghost btn-ghost-sm open-tool-split-main"
            onClick={() => onJumpToTool(saved.connectionId, saved.toolName)}
          >
            <ExternalLink size={14} />
            Open tool
          </button>
          <button
            type="button"
            className="btn-ghost btn-ghost-sm open-tool-split-caret"
            aria-expanded={openMenu}
            aria-haspopup="menu"
            aria-label="Open tool options"
            onClick={() => setOpenMenu((o) => !o)}
          >
            <ChevronDown size={14} />
          </button>
          {openMenu && (
            <div className="open-tool-split-menu" role="menu">
              <button
                type="button"
                className="open-tool-split-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(false);
                  onJumpToToolWithArgs(saved.connectionId, saved.toolName, saved.args);
                }}
              >
                Open tool with args
              </button>
            </div>
          )}
        </div>
        <button type="button" className="btn-ghost btn-ghost-sm danger" onClick={remove}>
          <Trash2 size={14} />
          Delete
        </button>
      </div>

      <div className="detail-section">
        <h3 className="section-title">Request args</h3>
        <pre className="saved-args-pre">{argsPretty}</pre>
      </div>

      <div className="detail-section">
        <h3 className="section-title">Response</h3>
        <ToolResultView key={`saved-result-${saved.id}`} result={saved.response} />
      </div>
    </div>
  );
}

function ToolDetail({
  node,
  onCall,
  connectionId,
  connectionTools,
  onSavedMutate,
  argsPrefill,
  onConsumeArgsPrefill,
  paramFieldKeyPrefix,
}: {
  node: McpTreeNode;
  onCall: Props["onCallTool"];
  connectionId: string | null;
  connectionTools: McpTool[];
  onSavedMutate: () => void;
  argsPrefill: Record<string, unknown> | null;
  onConsumeArgsPrefill: () => void;
  paramFieldKeyPrefix: string;
}) {
  const tool = node.data as McpTool;
  const { inFlightByNodeId, completedByNodeId } = useToolRuns();
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ToolCallResponse | null>(null);
  const [resultEpoch, setResultEpoch] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [addSuiteMenuOpen, setAddSuiteMenuOpen] = useState(false);
  const [addSuiteMenuList, setAddSuiteMenuList] = useState<PersistedTestSuite[]>([]);
  const [addSuiteBusy, setAddSuiteBusy] = useState(false);
  const addSuiteSplitRef = useRef<HTMLDivElement>(null);

  const nodeId = node.id;
  const inFlight = (inFlightByNodeId[nodeId] ?? 0) > 0;

  useEffect(() => {
    setArgs({});
    setResult(null);
    setErr(null);
  }, [tool.name, connectionId]);

  useEffect(() => {
    if (argsPrefill === null) return;
    setArgs(argsRecordToFormStrings(argsPrefill, tool.inputSchema));
    onConsumeArgsPrefill();
  }, [argsPrefill, tool.name, onConsumeArgsPrefill]);

  const completedSnap = completedByNodeId[nodeId];
  useEffect(() => {
    if (inFlight) return;
    if (!completedSnap) return;
    if (completedSnap.error) {
      setErr(completedSnap.error);
      setResult(null);
    } else if (completedSnap.result) {
      setResult(completedSnap.result);
      setErr(null);
      setResultEpoch((e) => e + 1);
    }
  }, [nodeId, inFlight, completedSnap?.at]);

  useEffect(() => {
    if (!addSuiteMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (addSuiteSplitRef.current?.contains(e.target as Node)) return;
      setAddSuiteMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addSuiteMenuOpen]);

  useEffect(() => {
    if (!addSuiteMenuOpen || !connectionId) return;
    let cancelled = false;
    (async () => {
      const res = await api.getTestSuites(connectionId);
      if (!cancelled && res.ok) setAddSuiteMenuList(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [addSuiteMenuOpen, connectionId]);

  const properties = tool.inputSchema?.properties ?? {};
  const required = tool.inputSchema?.required ?? [];

  async function run() {
    setErr(null);
    try {
      const res = await onCall(tool, coerceArgs(args, tool.inputSchema));
      setResult(res);
      setResultEpoch((e) => e + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function saveResponse(title: string) {
    if (!result || !connectionId) return;
    addSavedToolResponse({
      connectionId,
      toolName: tool.name,
      title: title.trim() || `${tool.name} · saved`,
      args: coerceArgs(args, tool.inputSchema),
      response: result,
    });
    onSavedMutate();
  }

  async function addCurrentToolToSuite(
    target: { mode: "last" } | { mode: "new" } | { mode: "suiteId"; suiteId: string }
  ) {
    if (!connectionId || connectionTools.length === 0) return;
    setAddSuiteBusy(true);
    try {
      const res = await api.appendTestSuiteStep(connectionId, {
        toolName: tool.name,
        argValues: { ...args },
        target,
      });
      if (res.ok) {
        notifyTestSuitesMutated(connectionId);
        setAddSuiteMenuOpen(false);
      }
    } finally {
      setAddSuiteBusy(false);
    }
  }

  return (
    <div className="detail-panel detail-panel-tool">
      <div className="detail-tool-header">
        <div className="detail-header detail-header-tool-inline">
          <div className="detail-title-row-tool">
            <div className="detail-title-stack">
              <div className="detail-kind-badge tool">Tool</div>
              <h2 className="detail-title">{tool.name}</h2>
            </div>
          </div>
          {tool.description && <MarkdownText text={tool.description} />}
        </div>
      </div>

      <div className="tool-workspace">
          <div className="tool-workspace-left">
            {Object.keys(properties).length > 0 && (
              <div className="detail-section">
                <h3 className="section-title">Parameters</h3>
                <div className="params-grid">
                  {Object.entries(properties).map(([key, schema]) => (
                    <ParamField
                      key={`${paramFieldKeyPrefix}:${key}`}
                      name={key}
                      schema={schema}
                      required={required.includes(key)}
                      value={args[key] ?? ""}
                      fieldStableKey={`${paramFieldKeyPrefix}:${key}`}
                      onChange={(v) => setArgs((p) => ({ ...p, [key]: v }))}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="detail-actions detail-actions-tool-row">
              <button type="button" className="btn-run" onClick={run} disabled={inFlight}>
                <Play size={16} strokeWidth={2.25} />
                {inFlight ? "Running…" : "Run tool"}
              </button>
              {connectionId && connectionTools.length > 0 && (
                <div className="add-to-suite-split" ref={addSuiteSplitRef}>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost-sm add-to-suite-split-main"
                    title="Append this tool and current args to the last test suite"
                    disabled={addSuiteBusy}
                    onClick={() => void addCurrentToolToSuite({ mode: "last" })}
                  >
                    <FlaskConical size={14} />
                    Add to test suite
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost-sm add-to-suite-split-caret"
                    aria-expanded={addSuiteMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Choose test suite"
                    disabled={addSuiteBusy}
                    onClick={() => setAddSuiteMenuOpen((o) => !o)}
                  >
                    <ChevronDown size={14} />
                  </button>
                  {addSuiteMenuOpen && (
                    <div className="add-to-suite-menu" role="menu">
                      <div className="add-to-suite-menu-hint">Add current args to</div>
                      <button
                        type="button"
                        className="add-to-suite-menu-item"
                        role="menuitem"
                        onClick={() => void addCurrentToolToSuite({ mode: "last" })}
                      >
                        Last suite
                      </button>
                      <button
                        type="button"
                        className="add-to-suite-menu-item"
                        role="menuitem"
                        onClick={() => void addCurrentToolToSuite({ mode: "new" })}
                      >
                        New suite…
                      </button>
                      {addSuiteMenuList.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="add-to-suite-menu-item"
                          role="menuitem"
                          onClick={() =>
                            void addCurrentToolToSuite({ mode: "suiteId", suiteId: s.id })
                          }
                        >
                          {s.name}
                          <span className="add-to-suite-menu-meta">
                            {" "}
                            ({s.steps.length} call{s.steps.length === 1 ? "" : "s"})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {err && <ErrorBox message={err} />}
            {err && completedSnap?.durationMs != null && !inFlight && (
              <p className="tool-run-elapsed">Elapsed {completedSnap.durationMs} ms</p>
            )}
          </div>

          <div className="tool-workspace-right tool-output-pane">
            {inFlight && (
              <div className="tool-output-loading" aria-busy="true">
                <div className="tool-output-loading-inner">
                  <SpinnerSvg size={32} label="Running tool" />
                  <span>Running tool…</span>
                </div>
              </div>
            )}
            {result ? (
              <ToolResultView
                key={resultEpoch}
                result={result}
                executionMs={completedSnap?.durationMs}
                defaultSaveTitle={`${tool.name} · ${new Date().toLocaleString()}`}
                onSaveResponse={connectionId ? saveResponse : undefined}
              />
            ) : (
              !inFlight && (
                <div className="tool-result-placeholder">
                  <p className="tool-result-placeholder-title">Output</p>
                  <p>Run the tool to see results here.</p>
                  <p className="tool-result-placeholder-hint">
                    Valid JSON appears in the explorer with expandable objects and arrays. Use
                    JSON for syntax-highlighted text.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
    </div>
  );
}

function ResourceDetail({
  node,
  connectionId,
  onRead,
}: {
  node: McpTreeNode;
  connectionId: string | null;
  onRead: Props["onReadResource"];
}) {
  const resource = node.data as McpResource;
  const [content, setContent] = useState<McpContent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setErr(null);
  }, [resource.uri, connectionId]);

  async function read() {
    setLoading(true);
    setErr(null);
    try {
      setContent(await onRead(resource));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="detail-panel detail-panel-tool">
      <div className="detail-tool-header">
        <div className="detail-header detail-header-tool-inline">
          <div className="detail-title-row-tool">
            <div className="detail-title-stack">
              <div className="detail-kind-badge resource">Resource</div>
              <h2 className="detail-title">{resource.name}</h2>
            </div>
          </div>
          <code className="detail-uri">{resource.uri}</code>
          {resource.description && <MarkdownText text={resource.description} />}
          {resource.mimeType && <span className="detail-mime">{resource.mimeType}</span>}
        </div>
      </div>

      <div className="tool-workspace">
          <div className="tool-workspace-left">
            <div className="detail-actions">
              <button type="button" className="btn-run" onClick={read} disabled={loading}>
                <FileText size={16} strokeWidth={2.25} />
                {loading ? "Reading…" : "Read resource"}
              </button>
            </div>
            {err && <ErrorBox message={err} />}
          </div>
          <div className="tool-workspace-right tool-output-pane">
            {loading && (
              <div className="tool-output-loading" aria-busy="true">
                <div className="tool-output-loading-inner">
                  <SpinnerSvg size={32} label="Reading resource" />
                  <span>Reading…</span>
                </div>
              </div>
            )}
            {content ? (
              <div className="resource-read-result-wrap">
                <ContentList items={content} />
              </div>
            ) : (
              !loading && (
                <div className="tool-result-placeholder">
                  <p className="tool-result-placeholder-title">Content</p>
                  <p>Read the resource to see content here.</p>
                </div>
              )
            )}
          </div>
        </div>
    </div>
  );
}

function PromptDetail({
  node,
  connectionId,
  onGet,
}: {
  node: McpTreeNode;
  connectionId: string | null;
  onGet: Props["onGetPrompt"];
}) {
  const prompt = node.data as McpPrompt;
  const [args, setArgs] = useState<Record<string, string>>({});
  const [content, setContent] = useState<McpContent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setErr(null);
    setArgs({});
  }, [prompt.name, connectionId]);

  async function get() {
    setLoading(true);
    setErr(null);
    try {
      setContent(await onGet(prompt, args));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="detail-panel detail-panel-tool">
      <div className="detail-tool-header">
        <div className="detail-header detail-header-tool-inline">
          <div className="detail-title-row-tool">
            <div className="detail-title-stack">
              <div className="detail-kind-badge prompt">Prompt</div>
              <h2 className="detail-title">{prompt.name}</h2>
            </div>
          </div>
          {prompt.description && <MarkdownText text={prompt.description} />}
        </div>
      </div>

      <div className="tool-workspace">
          <div className="tool-workspace-left">
            {prompt.arguments && prompt.arguments.length > 0 && (
              <div className="detail-section">
                <h3 className="section-title">Arguments</h3>
                <div className="params-grid">
                  {prompt.arguments.map((arg) => (
                    <div key={arg.name} className="param-field">
                      <label className="param-label">
                        {arg.name}
                        {arg.required && <span className="required-dot">*</span>}
                      </label>
                      {arg.description && <p className="param-hint">{arg.description}</p>}
                      <input
                        className="input"
                        value={args[arg.name] ?? ""}
                        onChange={(e) =>
                          setArgs((p) => ({ ...p, [arg.name]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="detail-actions">
              <button type="button" className="btn-run" onClick={get} disabled={loading}>
                <MessageSquare size={16} strokeWidth={2.25} />
                {loading ? "Getting…" : "Get prompt"}
              </button>
            </div>
            {err && <ErrorBox message={err} />}
          </div>
          <div className="tool-workspace-right tool-output-pane">
            {loading && (
              <div className="tool-output-loading" aria-busy="true">
                <div className="tool-output-loading-inner">
                  <SpinnerSvg size={32} label="Getting prompt" />
                  <span>Getting…</span>
                </div>
              </div>
            )}
            {content ? (
              <div className="resource-read-result-wrap">
                <ContentList items={content} />
              </div>
            ) : (
              !loading && (
                <div className="tool-result-placeholder">
                  <p className="tool-result-placeholder-title">Messages</p>
                  <p>Get the prompt to see messages here.</p>
                </div>
              )
            )}
          </div>
        </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error-box">
      <AlertCircle size={14} />
      <span>{message}</span>
    </div>
  );
}

function ContentList({ items }: { items: McpContent[] }) {
  const text = items.map((c) => c.text ?? "").filter(Boolean).join("\n\n");
  return (
    <div className="result-box">
      <ResultHeader label="Content" content={text} />
      <pre className="result-pre">{text || "(empty)"}</pre>
    </div>
  );
}

function ResultHeader({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="result-header">
      <span className="result-label">{label}</span>
      <button type="button" className="copy-btn" onClick={copy}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

