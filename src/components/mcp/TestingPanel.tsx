"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Play,
  Plus,
  Trash2,
  ChevronDown,
  ListOrdered,
  ChevronRight,
} from "lucide-react";
import type { McpTool, ToolCallResponse } from "@/types/mcp";
import { validateJsonAgainstSchema } from "@/lib/mcp/json-schema-lite";
import { toolResponseToParsedJson } from "@/lib/mcp/testing-assertions";
import type { JsonSchema } from "@/types/mcp";
import { SpinnerSvg } from "@/components/ui/SpinnerSvg";
import { argsRecordToFormStrings } from "@/lib/mcp/tool-args-prefill";
import { coerceArgs } from "@/lib/mcp/tool-args-coerce";
import { ToolParameterForm } from "@/components/mcp/ToolParameterFields";
import { api } from "@/lib/api-client";
import type {
  AssertionKind,
  PersistedSuiteStep,
  PersistedTestSuite,
} from "@/lib/mcp/test-suites-types";
import { notifyTestSuitesMutated } from "@/lib/mcp/test-suites-storage";
import { toolResponseToPrettyJson } from "@/lib/mcp/tool-result-json";
import { createEmptyPersistedStep } from "@/lib/mcp/test-suite-helpers";

type StepStatus = "idle" | "running" | "ok" | "err";

interface SuiteStep extends PersistedSuiteStep {
  status: StepStatus;
  lastError?: string;
  lastDurationMs?: number;
  lastResult?: ToolCallResponse;
}

type SuiteTab = "detail" | "summary";

export interface RunSummaryRow {
  stepIndex: number;
  toolName: string;
  outcome: StepStatus;
  durationMs?: number;
  message?: string;
}

interface WorkspaceProps {
  connectionId: string;
  suite: PersistedTestSuite;
  allSuites: PersistedTestSuite[];
  tools: McpTool[];
  callTool: (
    tool: McpTool,
    args: Record<string, unknown>
  ) => Promise<ToolCallResponse>;
  onSuiteDeleted?: () => void;
}

function hydrateSteps(steps: PersistedSuiteStep[]): SuiteStep[] {
  return steps.map((st) => ({ ...st, status: "idle" as const }));
}

function stripRuntime(
  suiteId: string,
  name: string,
  steps: SuiteStep[]
): PersistedTestSuite {
  return {
    id: suiteId,
    name,
    steps: steps.map(
      ({
        status: _s,
        lastError: _le,
        lastDurationMs: _d,
        lastResult: _lr,
        ...st
      }) => st
    ),
  };
}

function evaluateAssertion(
  res: ToolCallResponse,
  assertion: AssertionKind,
  schemaText: string
): { ok: true } | { ok: false; message: string } {
  switch (assertion) {
    case "none":
      return { ok: true };
    case "response_success":
      if (res.isError === true) {
        return {
          ok: false,
          message: "Expected success (isError false); tool reported isError",
        };
      }
      return { ok: true };
    case "response_error":
      if (res.isError !== true) {
        return {
          ok: false,
          message: "Expected tool error (isError true); got success",
        };
      }
      return { ok: true };
    case "output_schema": {
      let schema: JsonSchema;
      try {
        schema = JSON.parse(schemaText) as JsonSchema;
        if (!schema || typeof schema !== "object") {
          return { ok: false, message: "Assertion schema must be a JSON object" };
        }
      } catch (e) {
        return {
          ok: false,
          message: `Invalid JSON schema: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
      const parsed = toolResponseToParsedJson(res);
      if (parsed === null) {
        return { ok: false, message: "Response has no parseable JSON to validate" };
      }
      const errs = validateJsonAgainstSchema(parsed, schema);
      if (errs.length > 0) {
        return { ok: false, message: errs.join("; ") };
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

export function TestSuiteWorkspace({
  connectionId,
  suite: suiteProp,
  allSuites,
  tools,
  callTool,
  onSuiteDeleted,
}: WorkspaceProps) {
  const [tab, setTab] = useState<SuiteTab>("detail");
  const [name, setName] = useState(suiteProp.name);
  const [steps, setSteps] = useState<SuiteStep[]>(() =>
    hydrateSteps(suiteProp.steps)
  );
  const [suiteRunning, setSuiteRunning] = useState(false);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const [lastRun, setLastRun] = useState<{
    finishedAt: string;
    rows: RunSummaryRow[];
  } | null>(null);
  const runMenuRef = useRef<HTMLDivElement>(null);
  const readyToSave = useRef(false);
  const allSuitesRef = useRef(allSuites);
  allSuitesRef.current = allSuites;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const stepsFingerprint = useMemo(
    () => JSON.stringify(suiteProp.steps),
    [suiteProp.steps]
  );

  useEffect(() => {
    setName(suiteProp.name);
    setSteps(hydrateSteps(suiteProp.steps));
    readyToSave.current = true;
  }, [suiteProp.id, suiteProp.name, stepsFingerprint]);

  useEffect(() => {
    if (!runMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (runMenuRef.current?.contains(e.target as Node)) return;
      setRunMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [runMenuOpen]);

  useEffect(() => {
    if (!readyToSave.current) return;
    const t = setTimeout(() => {
      const merged = allSuitesRef.current.map((s) =>
        s.id === suiteProp.id ? stripRuntime(suiteProp.id, name, steps) : s
      );
      void api.putTestSuites(connectionId, merged).then((res) => {
        if (res.ok) notifyTestSuitesMutated(connectionId);
      });
    }, 450);
    return () => clearTimeout(t);
  }, [connectionId, suiteProp.id, name, steps]);

  const runStepImpl = useCallback(
    async (step: SuiteStep) => {
      const tool = tools.find((t) => t.name === step.toolName);
      if (!tool) return;
      const args = coerceArgs(step.argValues, tool.inputSchema);
      setSteps((list) =>
        list.map((st) =>
          st.id === step.id
            ? {
                ...st,
                status: "running" as const,
                lastError: undefined,
                lastResult: undefined,
              }
            : st
        )
      );
      const t0 = performance.now();
      try {
        const res = await callTool(tool, args);
        const lastDurationMs = Math.round(performance.now() - t0);
        const ev = evaluateAssertion(res, step.assertion, step.schemaText);
        if (!ev.ok) {
          setSteps((list) =>
            list.map((st) =>
              st.id === step.id
                ? {
                    ...st,
                    status: "err" as const,
                    lastDurationMs,
                    lastError: ev.message,
                    lastResult: res,
                  }
                : st
            )
          );
        } else {
          setSteps((list) =>
            list.map((st) =>
              st.id === step.id
                ? {
                    ...st,
                    status: "ok" as const,
                    lastDurationMs,
                    lastError: undefined,
                    lastResult: res,
                  }
                : st
            )
          );
        }
      } catch (e) {
        setSteps((list) =>
          list.map((st) =>
            st.id === step.id
              ? {
                  ...st,
                  status: "err" as const,
                  lastDurationMs: Math.round(performance.now() - t0),
                  lastError: e instanceof Error ? e.message : String(e),
                  lastResult: undefined,
                }
              : st
          )
        );
      }
    },
    [tools, callTool]
  );

  const runOneStep = useCallback(
    (step: SuiteStep) => {
      void runStepImpl(step);
    },
    [runStepImpl]
  );

  const captureSummaryFromState = useCallback(() => {
    const cur = stepsRef.current;
    setLastRun({
      finishedAt: new Date().toISOString(),
      rows: cur.map((st, i) => ({
        stepIndex: i + 1,
        toolName: st.toolName,
        outcome: st.status,
        durationMs: st.lastDurationMs,
        message: st.lastError,
      })),
    });
  }, []);

  const runSuiteSequential = async () => {
    setSuiteRunning(true);
    setRunMenuOpen(false);
    setTab("summary");
    try {
      const snapshot = stepsRef.current;
      for (const st of snapshot) {
        await runStepImpl(st);
      }
    } finally {
      setSuiteRunning(false);
    }
    setTimeout(() => captureSummaryFromState(), 0);
  };

  const runSuiteParallel = async () => {
    setSuiteRunning(true);
    setRunMenuOpen(false);
    setTab("summary");
    try {
      const snapshot = stepsRef.current;
      await Promise.all(snapshot.map((st) => runStepImpl(st)));
    } finally {
      setSuiteRunning(false);
    }
    setTimeout(() => captureSummaryFromState(), 0);
  };

  const updateStep = useCallback((stepId: string, patch: Partial<SuiteStep>) => {
    setSteps((list) =>
      list.map((st) => (st.id === stepId ? { ...st, ...patch } : st))
    );
  }, []);

  const setStepArgField = useCallback((stepId: string, key: string, value: string) => {
    setSteps((list) =>
      list.map((st) =>
        st.id !== stepId
          ? st
          : {
              ...st,
              argValues: { ...st.argValues, [key]: value },
              status: "idle",
            }
      )
    );
  }, []);

  const addStep = () => {
    setSteps((list) => [...list, { ...createEmptyPersistedStep(tools), status: "idle" }]);
  };

  const removeStep = (stepId: string) => {
    setSteps((list) => (list.length <= 1 ? list : list.filter((st) => st.id !== stepId)));
  };

  async function deleteSuite() {
    const next = allSuites.filter((s) => s.id !== suiteProp.id);
    const res = await api.putTestSuites(connectionId, next);
    if (res.ok) {
      notifyTestSuitesMutated(connectionId);
      onSuiteDeleted?.();
    }
  }

  if (tools.length === 0) {
    return (
      <div className="workspace-panel-empty">
        <p className="workspace-panel-empty-title">No tools</p>
        <p className="workspace-panel-empty-sub">
          Refresh the tree when this server exposes tools.
        </p>
      </div>
    );
  }

  const okCount = lastRun
    ? lastRun.rows.filter((r) => r.outcome === "ok").length
    : 0;
  const errCount = lastRun
    ? lastRun.rows.filter((r) => r.outcome === "err").length
    : 0;
  const doneCount = lastRun ? lastRun.rows.length : 0;
  const successRate =
    doneCount > 0 ? Math.round((okCount / doneCount) * 1000) / 10 : null;

  return (
    <div className="workspace-panel testing-panel testing-suite-workspace">
      <div className="testing-suite-workspace-head">
        <input
          className="input testing-suite-name-input testing-suite-workspace-title"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Suite name"
          aria-label="Test suite name"
        />
        <div className="main-workspace-tabs testing-suite-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "detail"}
            className={`workspace-tab ${tab === "detail" ? "active" : ""}`}
            onClick={() => setTab("detail")}
          >
            Detail
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "summary"}
            className={`workspace-tab ${tab === "summary" ? "active" : ""}`}
            onClick={() => setTab("summary")}
          >
            Summary
          </button>
        </div>
        <button
          type="button"
          className="btn-ghost btn-ghost-sm danger testing-suite-delete"
          title="Delete this test suite"
          onClick={() => void deleteSuite()}
        >
          <Trash2 size={14} />
          Delete suite
        </button>
      </div>

      {tab === "summary" && (
        <div className="testing-summary-toolbar">
          <div className="testing-run-split" ref={runMenuRef}>
            <button
              type="button"
              className="btn-primary testing-run-split-main"
              disabled={suiteRunning || steps.length === 0}
              onClick={() => void runSuiteSequential()}
            >
              <ListOrdered size={14} />
              Run suite
            </button>
            <button
              type="button"
              className="btn-primary testing-run-split-caret"
              disabled={suiteRunning || steps.length === 0}
              aria-expanded={runMenuOpen}
              aria-haspopup="menu"
              aria-label="Run options"
              onClick={(e) => {
                e.stopPropagation();
                setRunMenuOpen((o) => !o);
              }}
            >
              <ChevronDown size={14} />
            </button>
            {runMenuOpen && (
              <div className="testing-run-split-menu" role="menu">
                <button
                  type="button"
                  className="testing-run-split-menu-item"
                  role="menuitem"
                  onClick={() => void runSuiteSequential()}
                >
                  Run suite (sequential)
                </button>
                <button
                  type="button"
                  className="testing-run-split-menu-item"
                  role="menuitem"
                  onClick={() => void runSuiteParallel()}
                >
                  Batch run (parallel)
                </button>
              </div>
            )}
          </div>
          {suiteRunning && (
            <span className="testing-inline-loader">
              <SpinnerSvg size={16} />
              Running…
            </span>
          )}
        </div>
      )}

      {tab === "summary" && lastRun && (
        <div className="testing-summary-stats">
          <span>
            Finished{" "}
            <time dateTime={lastRun.finishedAt}>
              {new Date(lastRun.finishedAt).toLocaleString()}
            </time>
          </span>
          <span className="testing-summary-stat testing-summary-stat-ok">
            OK: {okCount}
          </span>
          <span className="testing-summary-stat testing-summary-stat-err">
            Failed: {errCount}
          </span>
          <span className="testing-summary-stat">
            Steps: {doneCount}
            {successRate != null && (
              <> · Success rate: {successRate}%</>
            )}
          </span>
        </div>
      )}

      {tab === "summary" && (
        <div className="testing-summary-table-wrap">
          <table className="testing-summary-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tool</th>
                <th>Outcome</th>
                <th>ms</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {lastRun ? (
                lastRun.rows.map((r) => (
                  <tr
                    key={r.stepIndex}
                    className={
                      r.outcome === "err"
                        ? "testing-summary-row-err"
                        : r.outcome === "ok"
                          ? "testing-summary-row-ok"
                          : ""
                    }
                  >
                    <td>{r.stepIndex}</td>
                    <td>
                      <code className="inline-code">{r.toolName}</code>
                    </td>
                    <td>{r.outcome}</td>
                    <td>{r.durationMs ?? "—"}</td>
                    <td className="testing-summary-notes">
                      {r.message ?? "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="testing-summary-empty">
                    Run the suite to see execution results and metrics here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "detail" && (
        <>
          <p className="field-hint executions-hub-hint testing-suite-detail-hint">
            Grid of tool calls in this suite. Use <strong>Summary</strong> to run the full
            suite and view pass/fail stats.
          </p>
          <div className="testing-step-gallery">
            {steps.map((step) => {
              const stepTool = tools.find((t) => t.name === step.toolName);
              const properties = stepTool?.inputSchema?.properties ?? {};
              const required = stepTool?.inputSchema?.required ?? [];
              return (
                <div key={step.id} className="testing-step-card">
                  <div className="testing-suite-step-head">
                    <select
                      className="input input-mono testing-tool-select"
                      value={step.toolName}
                      onChange={(e) => {
                        const n = e.target.value;
                        const t = tools.find((x) => x.name === n);
                        updateStep(step.id, {
                          toolName: n,
                          argValues: t
                            ? argsRecordToFormStrings({}, t.inputSchema)
                            : {},
                          status: "idle",
                          lastResult: undefined,
                        });
                      }}
                    >
                      {tools.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input testing-assertion-select"
                      value={step.assertion}
                      onChange={(e) =>
                        updateStep(step.id, {
                          assertion: e.target.value as AssertionKind,
                          status: "idle",
                        })
                      }
                    >
                      <option value="none">No assertion</option>
                      <option value="response_success">Response: expect success</option>
                      <option value="response_error">Response: expect tool error</option>
                      <option value="output_schema">Output JSON schema</option>
                    </select>
                    <button
                      type="button"
                      className="btn-run testing-run-one"
                      onClick={() => runOneStep(step)}
                      disabled={step.status === "running" || suiteRunning}
                    >
                      <Play size={14} />
                      {step.status === "running" ? "…" : "Run"}
                    </button>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Remove step"
                        onClick={() => removeStep(step.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {stepTool && (
                    <ToolParameterForm
                      properties={properties}
                      requiredKeys={required}
                      values={step.argValues}
                      fieldKeyPrefix={`suite:${suiteProp.id}:step:${step.id}`}
                      onFieldChange={(key, v) => setStepArgField(step.id, key, v)}
                    />
                  )}
                  {step.assertion === "output_schema" && (
                    <>
                      <label className="label label-inline">JSON Schema (output)</label>
                      <textarea
                        className="input input-mono testing-args"
                        style={{ minHeight: "88px" }}
                        value={step.schemaText}
                        onChange={(e) =>
                          updateStep(step.id, {
                            schemaText: e.target.value,
                            status: "idle",
                          })
                        }
                        spellCheck={false}
                      />
                    </>
                  )}
                  <div className={`testing-status status-${step.status}`}>
                    {step.status === "idle" && <span className="muted">Ready</span>}
                    {step.status === "running" && (
                      <span className="testing-inline-loader">
                        <SpinnerSvg size={16} />
                        Running…
                      </span>
                    )}
                    {step.status === "ok" && (
                      <span className="testing-pass-soft">
                        OK
                        {step.lastDurationMs != null && (
                          <span className="testing-duration">
                            {" "}
                            · {step.lastDurationMs} ms
                          </span>
                        )}
                      </span>
                    )}
                    {step.status === "err" && (
                      <span className="err">
                        {step.lastError ?? "Error"}
                        {step.lastDurationMs != null && (
                          <span className="testing-duration">
                            {" "}
                            · {step.lastDurationMs} ms
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <details className="testing-step-output">
                    <summary className="testing-step-output-summary">
                      <ChevronRight
                        size={14}
                        className="testing-step-output-summary-icon"
                        aria-hidden
                      />
                      <span>Output</span>
                      {step.lastResult != null && (
                        <span className="testing-step-output-badge">
                          {step.lastResult.isError ? "error" : "ok"}
                          {step.lastDurationMs != null
                            ? ` · ${step.lastDurationMs} ms`
                            : ""}
                        </span>
                      )}
                    </summary>
                    <div className="testing-step-output-body">
                      {step.lastResult != null ? (
                        <pre
                          className="testing-step-output-json"
                          key={`${step.id}-${step.lastDurationMs ?? 0}-${step.lastResult.isError ? "e" : "o"}`}
                        >
                          {toolResponseToPrettyJson(step.lastResult)}
                        </pre>
                      ) : (
                        <p className="muted testing-step-output-empty">
                          Run this step to show the MCP response here.
                        </p>
                      )}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn-ghost btn-ghost-sm testing-add-step" onClick={addStep}>
            <Plus size={12} />
            Add tool call
          </button>
        </>
      )}
    </div>
  );
}

