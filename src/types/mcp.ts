// ─── MCP Connection ──────────────────────────────────────────────────────────

export type McpTransportType = "stdio" | "sse" | "streamable-http";

/**
 * Remote HTTP auth mode.
 * - `bearer`: `Authorization: Bearer` from `bearerProfiles` / legacy `bearerToken`.
 * - `custom_headers`: only `authHeaders` + `headers` (e.g. API keys), no Bearer from this app.
 * - `oauth2_manual`: client_credentials POST to `oauth2Manual.tokenUrl`, then Bearer.
 * - `oauth2_mcp`: SDK OAuth flow against server metadata (client_credentials); requires server support.
 */
export type McpAuthType =
  | "none"
  | "bearer"
  | "custom_headers"
  | "oauth2_manual"
  | "oauth2_mcp";

export interface McpBearerProfile {
  label?: string;
  token: string;
}

/** OAuth 2.0 client_credentials against an explicit token URL (no metadata discovery). */
export interface McpOAuth2Manual {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

/** MCP-oriented OAuth: uses `@modelcontextprotocol/sdk` discovery + client_credentials. */
export interface McpOAuth2Mcp {
  clientId: string;
  clientSecret: string;
  scope?: string;
}

export interface McpConnectionConfig {
  id: string;
  /** Optional label; if empty, the UI uses the MCP server’s reported name after connect. */
  name: string;
  transport: McpTransportType;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse / streamable-http
  url?: string;
  /** Arbitrary static headers (merged with auth). */
  headers?: Record<string, string>;
  /** Used for remote transports; defaults to `none` when omitted. */
  authType?: McpAuthType;
  /** @deprecated Prefer `bearerProfiles`; still supported for single-token configs. */
  bearerToken?: string;
  /** Multiple saved bearer tokens; `activeBearerProfileIndex` selects which is sent. */
  bearerProfiles?: McpBearerProfile[];
  activeBearerProfileIndex?: number;
  /** Custom header rows (merged on every request; primary auth when `authType` is `custom_headers`). */
  authHeaders?: Array<{ name: string; value: string }>;
  oauth2Manual?: McpOAuth2Manual;
  oauth2Mcp?: McpOAuth2Mcp;
}

/** POST /connections body: optional `id` for stable restore from localStorage. */
export type AddConnectionInput = Omit<McpConnectionConfig, "id"> & { id?: string };

export type McpConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface McpConnection {
  config: McpConnectionConfig;
  status: McpConnectionStatus;
  error?: string;
  connectedAt?: string;
  /** Set when the last tree refresh saw `__debug_trace` on the server (tracing contract). */
  debugTraceAvailable?: boolean;
}

// ─── MCP Primitives ───────────────────────────────────────────────────────────

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

export interface McpContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolCallResponse {
  content: McpContent[];
  isError?: boolean;
}

/** Persisted tool run (Postman-like); stored in localStorage. */
export interface SavedToolResponse {
  id: string;
  connectionId: string;
  toolName: string;
  title: string;
  args: Record<string, unknown>;
  response: ToolCallResponse;
  createdAt: string;
}

// ─── API Tree ─────────────────────────────────────────────────────────────────

export type McpNodeKind =
  | "server"
  | "section"
  | "tool"
  | "resource"
  | "prompt"
  | "saved_response"
  | "executions_hub"
  | "test_suite";

/** Tree payload for a row under Executions → Testing. */
export interface TestSuiteTreePayload {
  suiteId: string;
}

export interface McpTreeNode {
  id: string;
  kind: McpNodeKind;
  label: string;
  description?: string;
  children?: McpTreeNode[];
  data?: McpTool | McpResource | McpPrompt | SavedToolResponse | TestSuiteTreePayload;
  badge?: string | number;
}

// ─── Execution ────────────────────────────────────────────────────────────────

export interface ToolCallRequest {
  connectionId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ResourceReadRequest {
  connectionId: string;
  uri: string;
}

export interface PromptGetRequest {
  connectionId: string;
  promptName: string;
  args?: Record<string, string>;
}

// ─── JSON Schema (minimal) ────────────────────────────────────────────────────

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
}

// ─── API Response wrappers ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  detail?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface McpServerSnapshot {
  connection: McpConnection;
  info?: McpServerInfo;
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
}
