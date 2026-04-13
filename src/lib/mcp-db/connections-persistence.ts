import type { McpConnectionConfig } from "@/types/mcp";
import { getMcpGuiDb } from "@/lib/mcp-db/sqlite";

function isValidConfig(x: unknown): x is McpConnectionConfig {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.transport === "string"
  );
}

export function loadAllConnectionConfigs(): McpConnectionConfig[] {
  const db = getMcpGuiDb();
  const rows = db
    .prepare(
      `SELECT config_json FROM gui_connections ORDER BY created_at ASC`
    )
    .all() as { config_json: string }[];
  const out: McpConnectionConfig[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.config_json) as unknown;
      if (isValidConfig(parsed)) out.push(parsed);
    } catch {
      /* skip corrupt row */
    }
  }
  return out;
}

export function upsertConnectionConfig(config: McpConnectionConfig): void {
  const db = getMcpGuiDb();
  const now = new Date().toISOString();
  const json = JSON.stringify(config);
  const row = db
    .prepare(`SELECT created_at FROM gui_connections WHERE id = ?`)
    .get(config.id) as { created_at: string } | undefined;
  if (row) {
    db.prepare(
      `UPDATE gui_connections SET config_json = ?, updated_at = ? WHERE id = ?`
    ).run(json, now, config.id);
  } else {
    db.prepare(
      `INSERT INTO gui_connections (id, config_json, created_at, updated_at) VALUES (?, ?, ?, ?)`
    ).run(config.id, json, now, now);
  }
}

export function deleteConnectionConfig(id: string): void {
  getMcpGuiDb()
    .prepare(`DELETE FROM gui_connections WHERE id = ?`)
    .run(id);
}
