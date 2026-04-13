import type { McpConnectionConfig } from "@/types/mcp";

const STORAGE_KEY = "mcp-gui.connections.v1";

interface StoredPayload {
  version: 1;
  connections: McpConnectionConfig[];
}

export function loadStoredConnectionConfigs(): McpConnectionConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Partial<StoredPayload>;
    if (data.version !== 1 || !Array.isArray(data.connections)) return [];
    return data.connections.filter(
      (c): c is McpConnectionConfig =>
        c != null &&
        typeof c === "object" &&
        typeof c.id === "string" &&
        typeof c.name === "string" &&
        typeof c.transport === "string"
    );
  } catch {
    return [];
  }
}

export function saveConnectionConfigs(configs: McpConnectionConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPayload = { version: 1, connections: configs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** After one-time migration into SQLite; connections now live in `data/mcp-gui.db`. */
export function clearStoredConnectionConfigs(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
