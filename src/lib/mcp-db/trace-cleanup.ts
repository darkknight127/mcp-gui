import { getMcpGuiDb } from "@/lib/mcp-db/sqlite";

export function deleteTraceDataForConnection(connectionId: string) {
  const db = getMcpGuiDb();
  db.prepare(`DELETE FROM trace_steps WHERE connection_id = ?`).run(
    connectionId
  );
  db.prepare(`DELETE FROM trace_batches WHERE connection_id = ?`).run(
    connectionId
  );
  db.prepare(
    `DELETE FROM connection_trace_secret WHERE connection_id = ?`
  ).run(connectionId);
}
