import { nanoid } from "nanoid";
import { registry } from "@/lib/mcp/registry";
import {
  loadAllConnectionConfigs,
  upsertConnectionConfig,
  deleteConnectionConfig,
} from "@/lib/mcp-db/connections-persistence";
import {
  createMcpClient,
  fetchServerInfo,
  fetchTools,
  fetchResources,
  fetchPrompts,
  callTool,
  readResource,
  getPrompt,
} from "@/lib/mcp/client";
import { buildApiTree } from "@/lib/mcp/tree-builder";
import { DEBUG_TRACE_TOOL_NAME } from "@/lib/mcp/debug-trace";
import { deleteTraceDataForConnection } from "@/lib/mcp-db/trace-cleanup";
import { countTraceStepsForConnection } from "@/lib/mcp-db/trace-step-count";
import type {
  McpConnectionConfig,
  AddConnectionInput,
  McpConnection,
  McpServerSnapshot,
  McpTreeNode,
  ToolCallRequest,
  ToolCallResponse,
  ResourceReadRequest,
  PromptGetRequest,
  McpContent,
} from "@/types/mcp";

const HYDRATE_KEY = "__mcp_gui_gui_connections_hydrated__";

function hydrateRegistryFromDatabase() {
  const g = globalThis as typeof globalThis & { [HYDRATE_KEY]?: boolean };
  if (g[HYDRATE_KEY]) return;
  for (const cfg of loadAllConnectionConfigs()) {
    if (!registry.get(cfg.id)) {
      registry.add(cfg);
    }
  }
  g[HYDRATE_KEY] = true;
}

// ─── Connections ──────────────────────────────────────────────────────────────

export function listConnections(): McpConnection[] {
  hydrateRegistryFromDatabase();
  return registry.getAll();
}

export async function addConnection(input: AddConnectionInput): Promise<McpConnection> {
  const id = input.id ?? nanoid(8);
  const config: McpConnectionConfig = {
    ...input,
    id,
    name: typeof input.name === "string" ? input.name : "",
  };
  const conn = registry.add(config);
  upsertConnectionConfig(conn.config);
  return conn;
}

export async function updateConnection(
  id: string,
  input: Omit<McpConnectionConfig, "id">
): Promise<McpConnection> {
  const config: McpConnectionConfig = {
    ...input,
    id,
    name: typeof input.name === "string" ? input.name : "",
  };
  const conn = await registry.updateConfig(id, config);
  upsertConnectionConfig(conn.config);
  return conn;
}

export async function connectServer(id: string): Promise<McpConnection> {
  const entry = registry.get(id);
  if (!entry) throw new Error(`Connection ${id} not found`);

  registry.setStatus(id, "connecting");

  try {
    const handle = await createMcpClient(entry.connection.config);
    registry.setHandle(id, handle);
    registry.setStatus(id, "connected");

    const client = registry.getClient(id);
    if (client) {
      const info = await fetchServerInfo(client);
      const fromServer = info?.name?.trim();
      if (!entry.connection.config.name.trim() && fromServer) {
        registry.patchConfig(id, { name: fromServer });
        const patched = registry.get(id)?.connection.config;
        if (patched) upsertConnectionConfig(patched);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    registry.setStatus(id, "error", msg);
    throw err;
  }

  return registry.get(id)!.connection;
}

export async function disconnectServer(id: string): Promise<void> {
  const entry = registry.get(id);
  if (!entry) throw new Error(`Connection ${id} not found`);
  if (entry.handle) {
    try { await entry.handle.close(); } catch { /* ignore */ }
  }
  registry.setStatus(id, "disconnected");
}

export async function removeConnection(id: string): Promise<void> {
  deleteTraceDataForConnection(id);
  await registry.remove(id);
  deleteConnectionConfig(id);
}

// ─── Snapshot / Tree ─────────────────────────────────────────────────────────

export async function getSnapshot(id: string): Promise<McpServerSnapshot> {
  const entry = registry.get(id);
  if (!entry) throw new Error(`Connection ${id} not found`);

  const client = registry.getClient(id);
  if (!client || entry.connection.status !== "connected") {
    return {
      connection: entry.connection,
      tools: [],
      resources: [],
      prompts: [],
    };
  }

  const [info, tools, resources, prompts] = await Promise.all([
    fetchServerInfo(client),
    fetchTools(client),
    fetchResources(client),
    fetchPrompts(client),
  ]);

  return { connection: entry.connection, info, tools, resources, prompts };
}

export async function getTree(id: string): Promise<McpTreeNode> {
  const snapshot = await getSnapshot(id);
  const hasDebugTrace = snapshot.tools.some(
    (t) => t.name === DEBUG_TRACE_TOOL_NAME
  );
  registry.setDebugTraceAvailable(id, hasDebugTrace);
  const traceCount = countTraceStepsForConnection(id);
  return buildApiTree(snapshot, traceCount);
}

export async function getAllTrees(): Promise<McpTreeNode[]> {
  const connections = registry.getAll();
  return Promise.all(connections.map((c) => getTree(c.config.id)));
}

// ─── Execution ────────────────────────────────────────────────────────────────

export async function executeTool(
  req: ToolCallRequest
): Promise<ToolCallResponse> {
  const client = registry.getClient(req.connectionId);
  if (!client)
    throw new Error(`No active client for connection ${req.connectionId}`);
  return callTool(client, req.toolName, req.args);
}

export async function fetchResource(
  req: ResourceReadRequest
): Promise<McpContent[]> {
  const client = registry.getClient(req.connectionId);
  if (!client)
    throw new Error(`No active client for connection ${req.connectionId}`);
  return readResource(client, req.uri);
}

export async function fetchPrompt(
  req: PromptGetRequest
): Promise<McpContent[]> {
  const client = registry.getClient(req.connectionId);
  if (!client)
    throw new Error(`No active client for connection ${req.connectionId}`);
  return getPrompt(client, req.promptName, req.args);
}
