import { nanoid } from "nanoid";
import { getMcpGuiDb } from "@/lib/mcp-db/sqlite";
import type {
  AssertionKind,
  PersistedSuiteStep,
  PersistedTestSuite,
} from "@/lib/mcp/test-suites-types";

export type { PersistedSuiteStep, PersistedTestSuite };

function defaultSchemaText() {
  return '{\n  "type": "object"\n}';
}

function nextSuiteName(existing: PersistedTestSuite[]): string {
  const re = /^Test Suite \((\d+)\)$/;
  let max = 0;
  for (const s of existing) {
    const m = re.exec(s.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Test Suite (${max + 1})`;
}

export function listConnectionTestSuites(connectionId: string): PersistedTestSuite[] {
  const db = getMcpGuiDb();
  const suiteRows = db
    .prepare(
      `SELECT id, name, sort_order FROM test_suites WHERE connection_id = ? ORDER BY sort_order ASC, name ASC`
    )
    .all(connectionId) as { id: string; name: string; sort_order: number }[];

  const stepStmt = db.prepare(
    `SELECT id, tool_name, arg_values_json, assertion, schema_text
     FROM test_suite_steps WHERE suite_id = ? ORDER BY step_index ASC`
  );

  return suiteRows.map((r) => {
    const stepRows = stepStmt.all(r.id) as {
      id: string;
      tool_name: string;
      arg_values_json: string;
      assertion: string;
      schema_text: string;
    }[];
    return {
      id: r.id,
      name: r.name,
      steps: stepRows.map((sr) => ({
        id: sr.id,
        toolName: sr.tool_name,
        argValues: safeParseArgValues(sr.arg_values_json),
        assertion: normalizeAssertion(sr.assertion),
        schemaText: sr.schema_text || defaultSchemaText(),
      })),
    };
  });
}

function safeParseArgValues(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
      else if (val != null) out[k] = JSON.stringify(val);
    }
    return out;
  } catch {
    return {};
  }
}

function normalizeAssertion(a: string): AssertionKind {
  if (
    a === "none" ||
    a === "response_success" ||
    a === "response_error" ||
    a === "output_schema"
  ) {
    return a;
  }
  return "response_success";
}

export function replaceConnectionTestSuites(
  connectionId: string,
  suites: PersistedTestSuite[]
): void {
  const db = getMcpGuiDb();
  const now = new Date().toISOString();
  const delSteps = db.prepare(
    `DELETE FROM test_suite_steps WHERE suite_id IN (SELECT id FROM test_suites WHERE connection_id = ?)`
  );
  const delSuites = db.prepare(`DELETE FROM test_suites WHERE connection_id = ?`);
  const insSuite = db.prepare(
    `INSERT INTO test_suites (id, connection_id, name, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insStep = db.prepare(
    `INSERT INTO test_suite_steps (id, suite_id, step_index, tool_name, arg_values_json, assertion, schema_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    delSteps.run(connectionId);
    delSuites.run(connectionId);
    suites.forEach((s, si) => {
      insSuite.run(s.id, connectionId, s.name, si, now);
      s.steps.forEach((st, ti) => {
        insStep.run(
          st.id,
          s.id,
          ti,
          st.toolName,
          JSON.stringify(st.argValues ?? {}),
          st.assertion,
          st.schemaText || defaultSchemaText()
        );
      });
    });
  })();
}

export type AppendTarget =
  | { mode: "last" }
  | { mode: "new" }
  | { mode: "suiteId"; suiteId: string };

export function appendToolCallToTestSuites(
  connectionId: string,
  toolName: string,
  argValues: Record<string, string>,
  target: AppendTarget
): PersistedTestSuite[] {
  let suites = listConnectionTestSuites(connectionId);
  const step: PersistedSuiteStep = {
    id: nanoid(8),
    toolName,
    argValues: { ...argValues },
    assertion: "response_success",
    schemaText: defaultSchemaText(),
  };

  if (suites.length === 0 || target.mode === "new") {
    suites = [
      ...suites,
      {
        id: nanoid(8),
        name: nextSuiteName(suites),
        steps: [step],
      },
    ];
  } else if (target.mode === "suiteId") {
    let hit = false;
    suites = suites.map((s) => {
      if (s.id !== target.suiteId) return s;
      hit = true;
      return { ...s, steps: [...s.steps, step] };
    });
    if (!hit) {
      suites = [
        ...suites,
        { id: nanoid(8), name: nextSuiteName(suites), steps: [step] },
      ];
    }
  } else {
    const last = suites[suites.length - 1];
    if (!last) {
      suites = [{ id: nanoid(8), name: "Test Suite (1)", steps: [step] }];
    } else {
      suites = [
        ...suites.slice(0, -1),
        { ...last, steps: [...last.steps, step] },
      ];
    }
  }

  replaceConnectionTestSuites(connectionId, suites);
  return suites;
}
