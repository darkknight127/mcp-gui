import { getMcpGuiDb } from "@/lib/mcp-db/sqlite";

export function countTraceStepsForConnection(connectionId: string): number {
  const row = getMcpGuiDb()
    .prepare(`SELECT COUNT(*) as c FROM trace_steps WHERE connection_id = ?`)
    .get(connectionId) as { c: number };
  return row.c;
}
