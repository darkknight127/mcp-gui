import type { ToolCallResponse, McpContent } from "@/types/mcp";

export function extractTextFromContent(content: McpContent[]): string {
  return content
    .map((c) => {
      if (c.type === "text" && c.text) return c.text;
      if (c.type === "image") return "";
      if (c.type === "resource") return c.text ?? "";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function stripCodeFence(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    const end = t.lastIndexOf("```");
    if (end > 3) {
      const inner = t.slice(3, end).replace(/^(?:json)?\s*\r?\n?/i, "");
      return inner.trim();
    }
  }
  return t;
}

function tryParseJsonFromResponse(text: string): unknown | null {
  const t = stripCodeFence(text);
  if (!t) return null;
  const looks =
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"));
  if (!looks) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

/** Dot/bracket path, e.g. `user.name` or `items[0].id` */
function getByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  let s = path.trim().replace(/^\$\.?/, "");
  while (s.length) {
    if (cur === null || cur === undefined) return undefined;
    if (s.startsWith("[")) {
      const end = s.indexOf("]");
      if (end < 0) return undefined;
      const idx = Number(s.slice(1, end));
      s = s.slice(end + 1).replace(/^\./, "");
      cur = Array.isArray(cur) ? cur[idx] : undefined;
      continue;
    }
    const dot = s.search(/[.\[]/);
    const key = dot < 0 ? s : s.slice(0, dot);
    s = dot < 0 ? "" : s.slice(dot).replace(/^\./, "");
    if (!key) break;
    cur =
      typeof cur === "object" && cur !== null && key in cur
        ? (cur as Record<string, unknown>)[key]
        : undefined;
  }
  return cur;
}

export type TestAssertion =
  | { type: "not_tool_error" }
  | { type: "text_contains"; value: string; caseInsensitive?: boolean }
  | { type: "text_matches"; pattern: string; flags?: string }
  | { type: "json_path_exists"; path: string }
  | { type: "json_path_equals"; path: string; value: unknown };

export interface AssertionResult {
  ok: boolean;
  failures: string[];
}

export function parseAssertionsJson(text: string): TestAssertion[] | null {
  const t = text.trim();
  if (!t) return [];
  try {
    const v = JSON.parse(t) as unknown;
    if (!Array.isArray(v)) return null;
    return v as TestAssertion[];
  } catch {
    return null;
  }
}

export function runAssertions(
  response: ToolCallResponse,
  assertions: TestAssertion[]
): AssertionResult {
  const failures: string[] = [];
  const text = extractTextFromContent(response.content);
  const parsed = tryParseJsonFromResponse(text);

  for (const a of assertions) {
    switch (a.type) {
      case "not_tool_error":
        if (response.isError) failures.push("not_tool_error: response.isError is true");
        break;
      case "text_contains": {
        const hay = a.caseInsensitive ? text.toLowerCase() : text;
        const needle = a.caseInsensitive ? a.value.toLowerCase() : a.value;
        if (!hay.includes(needle)) {
          failures.push(`text_contains: missing substring ${JSON.stringify(a.value)}`);
        }
        break;
      }
      case "text_matches": {
        let re: RegExp;
        try {
          re = new RegExp(a.pattern, a.flags ?? "");
        } catch {
          failures.push(`text_matches: invalid regex ${JSON.stringify(a.pattern)}`);
          break;
        }
        if (!re.test(text)) {
          failures.push(`text_matches: pattern did not match: ${a.pattern}`);
        }
        break;
      }
      case "json_path_exists": {
        if (parsed === null) {
          failures.push(`json_path_exists: response text is not JSON (${a.path})`);
          break;
        }
        const v = getByPath(parsed, a.path);
        if (v === undefined) {
          failures.push(`json_path_exists: path not found: ${a.path}`);
        }
        break;
      }
      case "json_path_equals": {
        if (parsed === null) {
          failures.push(`json_path_equals: response text is not JSON (${a.path})`);
          break;
        }
        const v = getByPath(parsed, a.path);
        const same =
          JSON.stringify(v) === JSON.stringify(a.value) ||
          (typeof v === "number" &&
            typeof a.value === "number" &&
            v === a.value) ||
          v === a.value;
        if (!same) {
          failures.push(
            `json_path_equals: ${a.path} expected ${JSON.stringify(a.value)} got ${JSON.stringify(v)}`
          );
        }
        break;
      }
      default: {
        const t = (a as { type?: string }).type ?? "?";
        failures.push(`unknown assertion type: ${t}`);
        break;
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

/** Parsed JSON from the first JSON-looking block in tool text content, if any. */
export function toolResponseToParsedJson(response: ToolCallResponse): unknown | null {
  const text = extractTextFromContent(response.content);
  return tryParseJsonFromResponse(text);
}
