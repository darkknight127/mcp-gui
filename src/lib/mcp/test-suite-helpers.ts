import { nanoid } from "nanoid";
import type { McpTool } from "@/types/mcp";
import type { PersistedSuiteStep, PersistedTestSuite } from "@/lib/mcp/test-suites-types";
import { argsRecordToFormStrings } from "@/lib/mcp/tool-args-prefill";

export function createEmptyPersistedStep(tools: McpTool[]): PersistedSuiteStep {
  const t = tools[0];
  return {
    id: nanoid(8),
    toolName: t?.name ?? "",
    argValues: t ? argsRecordToFormStrings({}, t.inputSchema) : {},
    assertion: "response_success",
    schemaText: '{\n  "type": "object"\n}',
  };
}

export function nextSuiteNameFromList(suites: PersistedTestSuite[]): string {
  const re = /^Test Suite \((\d+)\)$/;
  let max = 0;
  for (const s of suites) {
    const m = re.exec(s.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Test Suite (${max + 1})`;
}
