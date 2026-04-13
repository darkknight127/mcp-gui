import type {
  ApiResponse,
  McpConnection,
  McpConnectionConfig,
  AddConnectionInput,
  McpTreeNode,
  ToolCallResponse,
  McpContent,
} from "@/types/mcp";
import type { TraceStepDTO, TraceSetupPayload } from "@/types/trace";
import type { PersistedTestSuite } from "@/lib/mcp/test-suites-types";

/** Internal REST base for the desktop/web UI — https://github.com/darkknight127/mcp-gui */
const BASE = "/api/mcp";

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  return res.json() as Promise<ApiResponse<T>>;
}

// ─── Connections ──────────────────────────────────────────────────────────────

export const api = {
  listConnections: () =>
    request<McpConnection[]>("/connections"),

  addConnection: (input: AddConnectionInput) =>
    request<McpConnection>("/connections", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  connectServer: (id: string) =>
    request<McpConnection>(`/connections/${id}`, { method: "POST" }),

  disconnectServer: (id: string) =>
    request<null>(`/connections/${id}`, { method: "DELETE" }),

  removeConnection: (id: string) =>
    request<null>(`/connections/${id}`, { method: "PUT" }),

  updateConnection: (id: string, input: Omit<McpConnectionConfig, "id">) =>
    request<McpConnection>(`/connections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  // ─── Tree ───────────────────────────────────────────────────────────────────

  getTree: (id: string) =>
    request<McpTreeNode>(`/connections/${id}/tree`),

  // ─── Execution ──────────────────────────────────────────────────────────────

  callTool: (
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>
  ) =>
    request<ToolCallResponse>(`/connections/${connectionId}/tool`, {
      method: "POST",
      body: JSON.stringify({ toolName, args }),
    }),

  readResource: (connectionId: string, uri: string) =>
    request<McpContent[]>(`/connections/${connectionId}/resource`, {
      method: "POST",
      body: JSON.stringify({ uri }),
    }),

  getPrompt: (
    connectionId: string,
    promptName: string,
    args?: Record<string, string>
  ) =>
    request<McpContent[]>(`/connections/${connectionId}/prompt`, {
      method: "POST",
      body: JSON.stringify({ promptName, args }),
    }),

  // ─── Trace / executions (SQLite + __debug_trace) ─────────────────────────

  getTraceSecret: (connectionId: string) =>
    request<{ password: string | null }>(
      `/connections/${connectionId}/trace/secret`
    ),

  getTraceSetup: (connectionId: string) =>
    request<TraceSetupPayload>(`/connections/${connectionId}/trace/setup`),

  regenerateTraceSecret: (connectionId: string) =>
    request<{ password: string }>(`/connections/${connectionId}/trace/secret`, {
      method: "POST",
    }),

  pullTrace: (connectionId: string) =>
    request<{ inserted: number; ok: boolean; error?: string }>(
      `/connections/${connectionId}/trace/pull`,
      { method: "POST" }
    ),

  /** Probe live MCP session: `__debug_trace` handler runs (wrong password is OK). */
  checkTraceDebugger: (connectionId: string) =>
    request<{ reachable: boolean; message?: string }>(
      `/connections/${connectionId}/trace/check`,
      { method: "POST" }
    ),

  getTraceSteps: (
    connectionId: string,
    opts?: { toolName?: string; limit?: number }
  ) => {
    const q = new URLSearchParams();
    if (opts?.toolName?.trim()) q.set("toolName", opts.toolName.trim());
    q.set("limit", String(opts?.limit ?? 200));
    return request<TraceStepDTO[]>(
      `/connections/${connectionId}/trace/steps?${q.toString()}`
    );
  },

  // ─── Test suites (SQLite) ─────────────────────────────────────────────────

  getTestSuites: (connectionId: string) =>
    request<PersistedTestSuite[]>(`/connections/${connectionId}/test-suites`),

  putTestSuites: (connectionId: string, suites: PersistedTestSuite[]) =>
    request<null>(`/connections/${connectionId}/test-suites`, {
      method: "PUT",
      body: JSON.stringify({ suites }),
    }),

  appendTestSuiteStep: (
    connectionId: string,
    body: {
      toolName: string;
      argValues: Record<string, string>;
      target:
        | { mode: "last" }
        | { mode: "new" }
        | { mode: "suiteId"; suiteId: string };
    }
  ) =>
    request<PersistedTestSuite[]>(`/connections/${connectionId}/test-suites`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
