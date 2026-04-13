import type { McpClientHandle } from "@/lib/mcp/client";
import type { McpConnectionConfig, McpConnection } from "@/types/mcp";

interface RegistryEntry {
  connection: McpConnection;
  handle?: McpClientHandle;
}

class ConnectionRegistry {
  private entries = new Map<string, RegistryEntry>();

  add(config: McpConnectionConfig): McpConnection {
    const connection: McpConnection = {
      config,
      status: "disconnected",
    };
    this.entries.set(config.id, { connection });
    return connection;
  }

  get(id: string): RegistryEntry | undefined {
    return this.entries.get(id);
  }

  getAll(): McpConnection[] {
    return [...this.entries.values()].map((e) => e.connection);
  }

  setHandle(id: string, handle: McpClientHandle) {
    const entry = this.entries.get(id);
    if (entry) entry.handle = handle;
  }

  /** Merge fields into the stored config without closing an active client. */
  patchConfig(
    id: string,
    partial: Partial<Omit<McpConnectionConfig, "id">>
  ): McpConnection | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    entry.connection = {
      ...entry.connection,
      config: { ...entry.connection.config, ...partial },
    };
    return entry.connection;
  }

  async updateConfig(id: string, config: McpConnectionConfig): Promise<McpConnection> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Connection ${id} not found`);
    if (entry.handle) {
      try {
        await entry.handle.close();
      } catch {
        /* ignore */
      }
      entry.handle = undefined;
    }
    entry.connection = {
      config,
      status: "disconnected",
      error: undefined,
      connectedAt: undefined,
      debugTraceAvailable: undefined,
    };
    return entry.connection;
  }

  setStatus(
    id: string,
    status: McpConnection["status"],
    error?: string
  ) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.connection.status = status;
    entry.connection.error = error;
    if (status === "connected")
      entry.connection.connectedAt = new Date().toISOString();
  }

  setDebugTraceAvailable(id: string, available: boolean) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.connection = {
      ...entry.connection,
      debugTraceAvailable: available,
    };
  }

  async remove(id: string) {
    const entry = this.entries.get(id);
    if (entry?.handle) {
      try { await entry.handle.close(); } catch { /* ignore */ }
    }
    this.entries.delete(id);
  }

  getClient(id: string) {
    return this.entries.get(id)?.handle?.client;
  }
}

// Singleton — Next.js dev / Turbopack HMR may leave an old instance whose
// prototype predates new methods; realign prototype so registry methods always exist.
const globalKey = "__mcp_registry__";
declare global {
  var __mcp_registry__: ConnectionRegistry | undefined;
}

function getRegistry(): ConnectionRegistry {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: ConnectionRegistry;
  };
  let r = g[globalKey];
  if (!r) {
    r = new ConnectionRegistry();
    g[globalKey] = r;
  } else {
    Object.setPrototypeOf(r, ConnectionRegistry.prototype);
  }
  return r;
}

export const registry: ConnectionRegistry = getRegistry();
