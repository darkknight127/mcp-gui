import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS gui_connections (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connection_trace_secret (
  connection_id TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trace_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  entry_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trace_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL,
  batch_id INTEGER NOT NULL,
  step_index INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  step_type TEXT,
  duration_ms REAL,
  ok INTEGER,
  error_text TEXT,
  payload_json TEXT NOT NULL,
  server_ts REAL,
  fetched_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES trace_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_steps_conn_tool ON trace_steps(connection_id, tool_name);

CREATE TABLE IF NOT EXISTS test_suites (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_suite_steps (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  arg_values_json TEXT NOT NULL,
  assertion TEXT NOT NULL,
  schema_text TEXT NOT NULL,
  FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_test_suites_connection ON test_suites(connection_id);
CREATE INDEX IF NOT EXISTS idx_test_suite_steps_suite ON test_suite_steps(suite_id, step_index);
`;

let singleton: Database.Database | null = null;

export function getMcpGuiDb(): Database.Database {
  if (singleton) return singleton;
  const baseDir =
    process.env.MCP_GUI_DATA_DIR && process.env.MCP_GUI_DATA_DIR.trim() !== ""
      ? process.env.MCP_GUI_DATA_DIR
      : process.cwd();
  const dir = path.join(baseDir, "data");
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, "mcp-gui.db");
  const db = new Database(fp);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(INIT_SQL);
  singleton = db;
  return db;
}
