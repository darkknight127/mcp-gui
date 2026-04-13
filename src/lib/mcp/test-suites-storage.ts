/**
 * Legacy browser localStorage (v2/v3). Used once to migrate into SQLite when DB is empty.
 */
import { nanoid } from "nanoid";
import type { McpTool } from "@/types/mcp";
import { argsRecordToFormStrings } from "@/lib/mcp/tool-args-prefill";
import type {
  AssertionKind,
  PersistedSuiteStep,
  PersistedTestSuite,
} from "@/lib/mcp/test-suites-types";

export type { AssertionKind, PersistedSuiteStep, PersistedTestSuite } from "@/lib/mcp/test-suites-types";

const KEY_V2 = (cid: string) => `mcp-gui-test-suites:v2:${cid}`;
const KEY_V3 = (cid: string) => `mcp-gui-test-suites:v3:${cid}`;

export const TEST_SUITES_MUTATED = "mcp-gui-test-suites-mutated";

export function notifyTestSuitesMutated(connectionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TEST_SUITES_MUTATED, { detail: { connectionId } })
  );
}

function defaultSchemaText() {
  return '{\n  "type": "object"\n}';
}

function migrateV2Step(
  o: Record<string, unknown>,
  tools: McpTool[]
): PersistedSuiteStep {
  const toolName = String(o.toolName ?? "");
  const tool = tools.find((t) => t.name === toolName);
  const argsText = typeof o.argsText === "string" ? o.argsText : "{}";
  let argValues: Record<string, string> = {};
  if (tool) {
    try {
      const parsed = argsText.trim()
        ? (JSON.parse(argsText) as Record<string, unknown>)
        : {};
      argValues = argsRecordToFormStrings(parsed, tool.inputSchema);
    } catch {
      argValues = argsRecordToFormStrings({}, tool.inputSchema);
    }
  }
  const assertion =
    o.assertion === "none" ||
    o.assertion === "response_success" ||
    o.assertion === "response_error" ||
    o.assertion === "output_schema"
      ? o.assertion
      : "response_success";
  return {
    id: typeof o.id === "string" ? o.id : nanoid(8),
    toolName,
    argValues,
    assertion,
    schemaText:
      typeof o.schemaText === "string" ? o.schemaText : defaultSchemaText(),
  };
}

function tryParseV3(raw: string, tools: McpTool[]): PersistedTestSuite[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((s) => {
      const obj = s as Record<string, unknown>;
      const stepsRaw = obj.steps;
      const steps: PersistedSuiteStep[] = Array.isArray(stepsRaw)
        ? stepsRaw.map((st) => {
            const o = st as Record<string, unknown>;
            const toolName = String(o.toolName ?? "");
            const tool = tools.find((t) => t.name === toolName);
            let argValues: Record<string, string>;
            if (
              tool &&
              typeof o.argsText === "string" &&
              !(o.argValues && typeof o.argValues === "object")
            ) {
              return migrateV2Step(o, tools);
            }
            if (tool && o.argValues && typeof o.argValues === "object" && o.argValues !== null) {
              argValues = argsRecordToFormStrings(
                o.argValues as Record<string, unknown>,
                tool.inputSchema
              );
            } else if (tool) {
              argValues = argsRecordToFormStrings({}, tool.inputSchema);
            } else {
              argValues = {};
            }
            const assertion =
              o.assertion === "none" ||
              o.assertion === "response_success" ||
              o.assertion === "response_error" ||
              o.assertion === "output_schema"
                ? o.assertion
                : "response_success";
            return {
              id: typeof o.id === "string" ? o.id : nanoid(8),
              toolName,
              argValues,
              assertion,
              schemaText:
                typeof o.schemaText === "string" ? o.schemaText : defaultSchemaText(),
            };
          })
        : [];
      return {
        id: typeof obj.id === "string" ? obj.id : nanoid(8),
        name: typeof obj.name === "string" ? obj.name : "Test Suite (1)",
        steps,
      };
    });
  } catch {
    return null;
  }
}

/** Read suites from legacy localStorage only (for one-time migration). */
export function readLegacyLocalTestSuites(
  connectionId: string,
  tools: McpTool[]
): PersistedTestSuite[] {
  if (typeof window === "undefined") return [];
  try {
    const v3 = localStorage.getItem(KEY_V3(connectionId));
    if (v3) {
      const r = tryParseV3(v3, tools);
      if (r && r.length > 0) return r;
    }
    const v2 = localStorage.getItem(KEY_V2(connectionId));
    if (v2) {
      const parsed = JSON.parse(v2) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s) => {
          const obj = s as Record<string, unknown>;
          const stepsRaw = obj.steps;
          const steps: PersistedSuiteStep[] = Array.isArray(stepsRaw)
            ? stepsRaw.map((st) => migrateV2Step(st as Record<string, unknown>, tools))
            : [];
          return {
            id: typeof obj.id === "string" ? obj.id : nanoid(8),
            name: typeof obj.name === "string" ? obj.name : "Test Suite (1)",
            steps,
          };
        });
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function clearLegacyLocalTestSuites(connectionId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY_V3(connectionId));
    localStorage.removeItem(KEY_V2(connectionId));
  } catch {
    /* ignore */
  }
}
