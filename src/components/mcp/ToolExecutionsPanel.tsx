"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Stethoscope, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import type { TraceStepDTO } from "@/types/trace";
import { TracePayloadView } from "@/components/mcp/TracePayloadView";
import { TraceSetupGuide } from "@/components/mcp/TraceSetupGuide";
import type { TraceDebuggerPhase } from "@/hooks/use-trace-debugger-check";

export interface TraceDebuggerPanelProps {
  phase: TraceDebuggerPhase;
  detail: string | null;
  onCheck: () => void;
}

export interface ExecutionsPanelProps {
  connectionId: string;
  filterLogicalName?: string;
  /** `__debug_trace` appears in the server tool list (from last tree refresh). */
  debugTraceAvailable: boolean;
  /** When the tool is missing, render the long setup doc inside the panel (user opened Setup guide). */
  showSetupGuideInPanel?: boolean;
  traceDebugger: TraceDebuggerPanelProps;
  historyTitle?: string;
  onJumpToTarget?: (stepType: string | null, logicalName: string) => void;
  highlightLogicalName?: string;
}

function isFailedStep(row: TraceStepDTO): boolean {
  if (row.ok === false) return true;
  return Boolean(row.errorText?.trim());
}

export function ToolExecutionsPanel(props: ExecutionsPanelProps) {
  return <ExecutionsPanelInner {...props} />;
}

function ExecutionsPanelInner({
  connectionId,
  filterLogicalName,
  debugTraceAvailable,
  showSetupGuideInPanel = false,
  traceDebugger,
  historyTitle,
  onJumpToTarget,
  highlightLogicalName,
}: ExecutionsPanelProps) {
  const [steps, setSteps] = useState<TraceStepDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rightView, setRightView] = useState<"payload" | "error">("payload");

  const loadSteps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTraceSteps(connectionId, {
        toolName: filterLogicalName?.trim() || undefined,
        limit: 200,
      });
      if (res.ok) {
        const sorted = [...res.data].sort((a, b) => {
          const t = b.fetchedAt.localeCompare(a.fetchedAt);
          if (t !== 0) return t;
          return b.id - a.id;
        });
        setSteps(sorted);
        setSelectedId((prev) => {
          if (sorted.length === 0) return null;
          if (prev != null && sorted.some((s) => s.id === prev)) return prev;
          return sorted[0]?.id ?? null;
        });
      } else {
        setSteps([]);
        setSelectedId(null);
      }
    } catch {
      setSteps([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [connectionId, filterLogicalName]);

  useEffect(() => {
    void loadSteps();
  }, [loadSteps]);

  async function pullNow() {
    setPullMsg(null);
    const res = await api.pullTrace(connectionId);
    if (!res.ok) {
      setPullMsg(res.error);
      return;
    }
    const { inserted, ok, error } = res.data;
    if (!ok) {
      setPullMsg(
        error === "no_trace_secret"
          ? "No trace password yet — open Edit MCP Server, set MCP_DEBUG_PASSWORD, then try again."
          : (error ?? "Pull failed")
      );
    } else {
      setPullMsg(`Imported ${inserted} trace step(s).`);
    }
    await loadSteps();
  }

  const selected = steps.find((s) => s.id === selectedId) ?? null;
  const defaultHistoryTitle = filterLogicalName
    ? `Execution history (${filterLogicalName})`
    : "Execution history";

  const lastSynced = useMemo(() => {
    if (steps.length === 0) return null;
    const iso = steps.reduce(
      (best, s) => (s.fetchedAt > best ? s.fetchedAt : best),
      steps[0]!.fetchedAt
    );
    return { iso, label: new Date(iso).toLocaleString() };
  }, [steps]);

  const errorTextFor = (row: TraceStepDTO) =>
    row.errorText?.trim() ||
    (row.ok === false ? "(marked not OK — no error message)" : "");

  const showErrorPane = selected != null && isFailedStep(selected);
  const { phase: dbgPhase, detail: dbgDetail, onCheck: onDbgCheck } = traceDebugger;

  return (
    <div className="tool-executions-panel tool-executions-panel-split">
      <div className="tool-workspace executions-tool-workspace">
        <div className="tool-workspace-left executions-workspace-left">
          <div className="tool-executions-setup tool-executions-setup-compact tool-executions-live-session">
            <h3 className="section-title">Live session</h3>
            <p className="tool-executions-hint tool-executions-hint-tight">
              Verify the MCP connection can run <code className="inline-code">__debug_trace</code>{" "}
              (wrong password is OK). Use this before pull if you are unsure the server is ready.
            </p>
            <div className="tool-executions-debugger-detail-row">
              <span className="executions-dbg-status" role="status" aria-live="polite">
                {dbgPhase === "checking" || dbgPhase === "idle" ? (
                  <span className="muted">Checking debugger…</span>
                ) : dbgPhase === "ok" ? (
                  <span className="executions-dbg-status-ok">
                    <CheckCircle2 size={14} aria-hidden />
                    Debugger OK — ready for executions
                  </span>
                ) : (
                  <span className="executions-dbg-status-err" title={dbgDetail ?? ""}>
                    <AlertCircle size={14} aria-hidden />
                    <span className="executions-dbg-status-err-text">
                      {dbgDetail ?? "Unreachable"}
                    </span>
                  </span>
                )}
              </span>
              <button
                type="button"
                className="btn-ghost btn-ghost-sm"
                onClick={() => void onDbgCheck()}
                disabled={dbgPhase === "checking"}
              >
                <Stethoscope size={14} />
                Check debugger
              </button>
            </div>
          </div>

          {debugTraceAvailable && (
            <div className="tool-executions-setup tool-executions-setup-compact">
              <h3 className="section-title">Server tracing</h3>
              <p className="tool-executions-hint">
                Pull imports steps from <code className="inline-code">__debug_trace</code>.
                Password: <strong>Edit MCP Server</strong> →{" "}
                <code className="inline-code">MCP_DEBUG_PASSWORD</code>.
              </p>
              <div className="tool-executions-actions">
                <button
                  type="button"
                  className="btn-primary tool-executions-pull"
                  onClick={pullNow}
                >
                  <RefreshCw size={14} />
                  Pull trace
                </button>
                <button type="button" className="btn-ghost btn-ghost-sm" onClick={loadSteps}>
                  Refresh list
                </button>
              </div>
              {pullMsg && <p className="tool-executions-pull-msg">{pullMsg}</p>}
            </div>
          )}

          {!debugTraceAvailable && (
            <p className="tool-executions-hint tool-executions-hint-warn">
              <code className="inline-code">__debug_trace</code> is not in this server&apos;s tool
              list yet (refresh the tree after you add it). Pull is disabled until then. Stored
              executions below are unchanged — empty rows do not mean you need the setup guide.
            </p>
          )}

          {showSetupGuideInPanel && (
            <div
              id="trace-log-setup-anchor"
              className="executions-inline-setup-guide executions-inline-setup-guide-in-panel"
            >
              <TraceSetupGuide />
            </div>
          )}

          <div className="executions-history-heading">
            <h3 className="section-title">{historyTitle ?? defaultHistoryTitle}</h3>
            {lastSynced && (
              <p className="executions-last-synced muted">
                Last synced <time dateTime={lastSynced.iso}>{lastSynced.label}</time>
              </p>
            )}
          </div>
          <p className="executions-all-types-hint">
            All trace steps are listed. Failed rows use a red name; use{" "}
            <strong>Error</strong> when present to read the message in the explorer.
          </p>
          {loading && <p className="muted">Loading…</p>}

          {!loading && steps.length === 0 && (
            <div className="tool-executions-empty">
              <p>No trace steps{filterLogicalName ? ` for ${filterLogicalName}` : ""} in storage yet.</p>
              {debugTraceAvailable ? (
                <p className="muted">
                  Run handlers on the server with tracing enabled, then pull or wait for poll.
                </p>
              ) : (
                <p className="muted">
                  Pull requires <code className="inline-code">__debug_trace</code> on the server.
                  You can still use Check debugger after adding the tool and refreshing the
                  connection.
                </p>
              )}
            </div>
          )}

          {steps.length > 0 && (
            <div className="executions-table-scroll">
              <table className="tool-executions-table executions-log-table">
                <thead>
                  <tr>
                    {!filterLogicalName && <th>Kind</th>}
                    <th>Name</th>
                    <th>Synced</th>
                    <th>Duration</th>
                    <th>OK</th>
                    <th> </th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((row) => {
                    const isSel = row.id === selectedId;
                    const isCtx =
                      highlightLogicalName != null &&
                      row.toolName === highlightLogicalName;
                    const failed = isFailedStep(row);
                    return (
                      <tr
                        key={row.id}
                        className={`executions-log-row ${isSel ? "selected" : ""} ${isCtx ? "executions-row-context" : ""}`}
                        onClick={() => {
                          setSelectedId(row.id);
                          setRightView("payload");
                        }}
                      >
                        {!filterLogicalName && (
                          <td className="mono executions-kind-cell">{row.stepType ?? "—"}</td>
                        )}
                        <td className="executions-name-cell">
                          {onJumpToTarget ? (
                            <button
                              type="button"
                              className={`executions-name-anchor ${failed ? "executions-error-name" : "executions-ok-name"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onJumpToTarget(row.stepType, row.toolName);
                              }}
                            >
                              {row.toolName}
                            </button>
                          ) : (
                            <span className={`mono ${failed ? "executions-error-name" : "executions-ok-name"}`}>
                              {row.toolName}
                            </span>
                          )}
                        </td>
                        <td className="mono executions-time-cell">
                          {new Date(row.fetchedAt).toLocaleString()}
                        </td>
                        <td className="mono">
                          {row.durationMs != null ? `${Math.round(row.durationMs)} ms` : "—"}
                        </td>
                        <td className="mono executions-ok-cell">
                          {row.ok === null ? "—" : row.ok ? "yes" : "no"}
                        </td>
                        <td>
                          {failed ? (
                            <button
                              type="button"
                              className="btn-ghost btn-ghost-sm executions-error-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(row.id);
                                setRightView("error");
                              }}
                            >
                              Error
                            </button>
                          ) : (
                            <span className="executions-no-err-placeholder">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="tool-workspace-right executions-output-pane">
          {selected ? (
            <>
              <div className="executions-explorer-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightView === "payload"}
                  className={`executions-explorer-tab ${rightView === "payload" ? "active" : ""}`}
                  onClick={() => setRightView("payload")}
                >
                  Payload
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightView === "error"}
                  disabled={!showErrorPane}
                  className={`executions-explorer-tab ${rightView === "error" ? "active" : ""} ${!showErrorPane ? "disabled" : ""}`}
                  onClick={() => showErrorPane && setRightView("error")}
                >
                  Error
                </button>
              </div>
              {rightView === "payload" ? (
                <TracePayloadView
                  key={`p-${selected.id}`}
                  payloadJson={selected.payloadJson}
                  title="Step payload"
                />
              ) : showErrorPane ? (
                <pre className="executions-error-pane-pre">{errorTextFor(selected)}</pre>
              ) : (
                <div className="tool-result-placeholder">
                  <p className="tool-result-placeholder-title">Error</p>
                  <p className="muted">This step has no error payload. View Payload instead.</p>
                </div>
              )}
            </>
          ) : (
            <div className="tool-result-placeholder">
              <p className="tool-result-placeholder-title">Explorer</p>
              <p>Select a row to explore payload. Use Error for failed steps.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
