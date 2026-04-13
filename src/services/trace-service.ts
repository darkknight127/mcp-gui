import { nanoid } from "nanoid";
import { getMcpGuiDb } from "@/lib/mcp-db/sqlite";
import { registry } from "@/lib/mcp/registry";
import { executeTool } from "@/services/mcp-service";
import { DEBUG_TRACE_TOOL_NAME } from "@/lib/mcp/debug-trace";
import type { ToolCallResponse, McpContent } from "@/types/mcp";
import type { TraceSetupPayload } from "@/types/trace";
const MAX_STEPS_PER_CONNECTION = 2000;
const TRIM_CHUNK = 400;

function extractText(content: McpContent[]): string {
  return content
    .map((c) => {
      if (c.type === "text" && c.text) return c.text;
      if (c.type === "resource") return c.text ?? "";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function parseJsonFromToolResponse(res: ToolCallResponse): unknown | null {
  const text = extractText(res.content).trim();
  if (!text) return null;
  const t = text.startsWith("```")
    ? text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")
    : text;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

export interface TraceStepRow {
  id: number;
  connectionId: string;
  batchId: number;
  stepIndex: number;
  toolName: string;
  stepType: string | null;
  durationMs: number | null;
  ok: boolean | null;
  errorText: string | null;
  payloadJson: string;
  serverTs: number | null;
  fetchedAt: string;
}

function trimOldSteps(connectionId: string) {
  const db = getMcpGuiDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM trace_steps WHERE connection_id = ?`
    )
    .get(connectionId) as { c: number };
  if (row.c <= MAX_STEPS_PER_CONNECTION) return;
  db.prepare(
    `DELETE FROM trace_steps WHERE connection_id = ? AND id IN (
      SELECT id FROM trace_steps WHERE connection_id = ? ORDER BY id ASC LIMIT ?
    )`
  ).run(connectionId, connectionId, TRIM_CHUNK);
}

/** Drop legacy duplicate keys (`type`, `tool`) when persisting trace rows. */
function slimTracePayloadItem(item: unknown): unknown {
  if (item == null || typeof item !== "object" || Array.isArray(item)) return item;
  const o = item as Record<string, unknown>;
  const next: Record<string, unknown> = { ...o };
  delete next.type;
  delete next.tool;
  return next;
}

/** Stable fingerprint so heartbeat polls do not open a new `trace_batches` row when nothing changed. */
function tracePayloadSignature(trace: unknown[]): string {
  return JSON.stringify(trace.map((item) => slimTracePayloadItem(item)));
}

function getLatestStoredTraceSignature(connectionId: string): string | null {
  const db = getMcpGuiDb();
  const batch = db
    .prepare(
      `SELECT id FROM trace_batches WHERE connection_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(connectionId) as { id: number } | undefined;
  if (!batch) return null;
  const rows = db
    .prepare(
      `SELECT payload_json FROM trace_steps WHERE connection_id = ? AND batch_id = ? ORDER BY step_index ASC`
    )
    .all(connectionId, batch.id) as { payload_json: string }[];
  if (rows.length === 0) return null;
  const parts = rows.map((r) => JSON.parse(r.payload_json) as unknown);
  return JSON.stringify(parts);
}

function normalizeStep(raw: Record<string, unknown>): {
  toolName: string;
  stepType: string | null;
  durationMs: number | null;
  ok: number | null;
  errorText: string | null;
  serverTs: number | null;
} {
  const toolName =
    String(raw.name ?? raw.tool ?? raw.toolName ?? "unknown").trim() || "unknown";
  const stepType = raw.kind != null ? String(raw.kind) : null;
  let durationMs: number | null = null;
  if (typeof raw.duration_ms === "number") durationMs = raw.duration_ms;
  else if (typeof raw.durationMs === "number") durationMs = raw.durationMs;
  else if (typeof raw.duration === "number")
    durationMs = raw.duration * 1000;
  const ok =
    typeof raw.ok === "boolean"
      ? raw.ok
        ? 1
        : 0
      : raw.error != null
        ? 0
        : null;
  const errorText =
    raw.error != null
      ? typeof raw.error === "string"
        ? raw.error
        : JSON.stringify(raw.error)
      : null;
  const serverTs =
    typeof raw.timestamp === "number"
      ? raw.timestamp
      : typeof raw.ts === "number"
        ? raw.ts
        : null;
  return { toolName, stepType, durationMs, ok, errorText, serverTs };
}

/**
 * Used by Edit connection: only show password UI when the server advertises
 * `__debug_trace` and a probe call reaches the tool handler (wrong password is OK).
 */
export async function getTraceToolSetupForEdit(
  connectionId: string
): Promise<TraceSetupPayload> {
  const entry = registry.get(connectionId);
  if (!entry) return { advertised: false };
  if (!entry.connection.debugTraceAvailable) return { advertised: false };

  if (
    entry.connection.status !== "connected" ||
    !registry.getClient(connectionId)
  ) {
    return {
      advertised: true,
      reachable: false,
      message:
        "Connect this server, then open Edit again. The trace tool can only be verified on an active connection.",
    };
  }

  try {
    await executeTool({
      connectionId,
      toolName: DEBUG_TRACE_TOOL_NAME,
      args: { password: "__mcp_gui_probe_invalid__" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      advertised: true,
      reachable: false,
      message: `The trace tool is not reachable: ${msg}`,
    };
  }

  let password: string | null = null;
  let passwordError: string | undefined;
  try {
    password = getTraceSecretIfExists(connectionId);
  } catch (e) {
    passwordError = e instanceof Error ? e.message : String(e);
  }

  return {
    advertised: true,
    reachable: true,
    password,
    passwordError,
  };
}

/**
 * Verifies `__debug_trace` is not only listed but the handler runs (invalid password is OK).
 * Use from the Trace log so users can confirm the debugger is loaded on the live connection.
 */
export async function checkDebugTraceLoaded(
  connectionId: string
): Promise<{ reachable: true } | { reachable: false; message: string }> {
  const entry = registry.get(connectionId);
  if (!entry) {
    return { reachable: false, message: "Connection not found." };
  }
  if (
    entry.connection.status !== "connected" ||
    !registry.getClient(connectionId)
  ) {
    return {
      reachable: false,
      message:
        "Connect this server first so the trace tool can be reached on the live MCP session.",
    };
  }
  try {
    await executeTool({
      connectionId,
      toolName: DEBUG_TRACE_TOOL_NAME,
      args: { password: "__mcp_gui_probe_invalid__" },
    });
    return { reachable: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      reachable: false,
      message: `Debugger did not respond: ${msg}`,
    };
  }
}

export function getTraceSecretIfExists(connectionId: string): string | null {
  const db = getMcpGuiDb();
  const row = db
    .prepare(
      `SELECT password FROM connection_trace_secret WHERE connection_id = ?`
    )
    .get(connectionId) as { password: string } | undefined;
  return row?.password ?? null;
}

/** Replace or insert a new random trace password (for MCP_DEBUG_PASSWORD on the server). */
export function regenerateTraceSecret(connectionId: string): { password: string } {
  const db = getMcpGuiDb();
  const password = nanoid(28);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO connection_trace_secret (connection_id, password, created_at) VALUES (?, ?, ?)
     ON CONFLICT(connection_id) DO UPDATE SET password = excluded.password, created_at = excluded.created_at`
  ).run(connectionId, password, createdAt);
  return { password };
}

export async function pullTraceFromServer(connectionId: string): Promise<{
  ok: boolean;
  inserted: number;
  error?: string;
}> {
  const db = getMcpGuiDb();
  const secret = db
    .prepare(
      `SELECT password FROM connection_trace_secret WHERE connection_id = ?`
    )
    .get(connectionId) as { password: string } | undefined;
  if (!secret) {
    return { ok: false, inserted: 0, error: "no_trace_secret" };
  }

  let res: ToolCallResponse;
  try {
    res = await executeTool({
      connectionId,
      toolName: DEBUG_TRACE_TOOL_NAME,
      args: { password: secret.password },
    });
  } catch (e) {
    return {
      ok: false,
      inserted: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const parsed = parseJsonFromToolResponse(res);
  if (!parsed || typeof parsed !== "object" || parsed === null) {
    return { ok: false, inserted: 0, error: "invalid_trace_json" };
  }
  const obj = parsed as Record<string, unknown>;
  const trace = obj.trace;
  if (!Array.isArray(trace)) {
    return { ok: false, inserted: 0, error: "missing_trace_array" };
  }

  // Heartbeat polls every ~30s; skip SQLite writes when the server trace is empty or unchanged
  // so `trace_batches` is not filled with one row per poll. See https://github.com/darkknight127/mcp-gui
  if (trace.length === 0) {
    return { ok: true, inserted: 0 };
  }
  const incomingSig = tracePayloadSignature(trace);
  const previousSig = getLatestStoredTraceSignature(connectionId);
  if (previousSig !== null && previousSig === incomingSig) {
    return { ok: true, inserted: 0 };
  }

  const fetchedAt = new Date().toISOString();
  const batch = db
    .prepare(
      `INSERT INTO trace_batches (connection_id, fetched_at, entry_count) VALUES (?, ?, ?)`
    )
    .run(connectionId, fetchedAt, trace.length);
  const batchId = Number(batch.lastInsertRowid);

  const insertStep = db.prepare(
    `INSERT INTO trace_steps (
      connection_id, batch_id, step_index, tool_name, step_type, duration_ms, ok, error_text, payload_json, server_ts, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let inserted = 0;
  const insertMany = db.transaction((steps: unknown[]) => {
    steps.forEach((item, stepIndex) => {
      const raw =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : { value: item };
      const n = normalizeStep(raw);
      const payloadJson = JSON.stringify(slimTracePayloadItem(item));
      insertStep.run(
        connectionId,
        batchId,
        stepIndex,
        n.toolName,
        n.stepType,
        n.durationMs,
        n.ok,
        n.errorText,
        payloadJson,
        n.serverTs,
        fetchedAt
      );
      inserted += 1;
    });
  });

  insertMany(trace);
  trimOldSteps(connectionId);
  return { ok: true, inserted };
}

export function listAllTraceSteps(connectionId: string, limit = 200): TraceStepRow[] {
  const db = getMcpGuiDb();
  const rows = db
    .prepare(
      `SELECT id, connection_id, batch_id, step_index, tool_name, step_type, duration_ms, ok, error_text, payload_json, server_ts, fetched_at
       FROM trace_steps
       WHERE connection_id = ?
       ORDER BY fetched_at DESC, id DESC
       LIMIT ?`
    )
    .all(connectionId, limit) as Array<{
      id: number;
      connection_id: string;
      batch_id: number;
      step_index: number;
      tool_name: string;
      step_type: string | null;
      duration_ms: number | null;
      ok: number | null;
      error_text: string | null;
      payload_json: string;
      server_ts: number | null;
      fetched_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    batchId: r.batch_id,
    stepIndex: r.step_index,
    toolName: r.tool_name,
    stepType: r.step_type,
    durationMs: r.duration_ms,
    ok: r.ok === null ? null : r.ok === 1,
    errorText: r.error_text,
    payloadJson: r.payload_json,
    serverTs: r.server_ts,
    fetchedAt: r.fetched_at,
  }));
}

export function listTraceSteps(
  connectionId: string,
  toolName: string,
  limit = 100
): TraceStepRow[] {
  const db = getMcpGuiDb();
  const rows = db
    .prepare(
      `SELECT id, connection_id, batch_id, step_index, tool_name, step_type, duration_ms, ok, error_text, payload_json, server_ts, fetched_at
       FROM trace_steps
       WHERE connection_id = ? AND tool_name = ?
       ORDER BY fetched_at DESC, id DESC
       LIMIT ?`
    )
    .all(connectionId, toolName, limit) as Array<{
      id: number;
      connection_id: string;
      batch_id: number;
      step_index: number;
      tool_name: string;
      step_type: string | null;
      duration_ms: number | null;
      ok: number | null;
      error_text: string | null;
      payload_json: string;
      server_ts: number | null;
      fetched_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    batchId: r.batch_id,
    stepIndex: r.step_index,
    toolName: r.tool_name,
    stepType: r.step_type,
    durationMs: r.duration_ms,
    ok: r.ok === null ? null : r.ok === 1,
    errorText: r.error_text,
    payloadJson: r.payload_json,
    serverTs: r.server_ts,
    fetchedAt: r.fetched_at,
  }));
}
